"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { Loader2, Sparkles } from "lucide-react";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { HeroPanel } from "@/components/scene/HeroPanel";
import { CountdownClock } from "@/components/scene/CountdownClock";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { InputMilestoneFX } from "@/components/scene/InputMilestoneFX";
import { FoilSweep } from "@/components/scene/FoilSweep";
import { HourglassSand } from "@/components/scene/HourglassSand";
import { WanderingSpotlight } from "@/components/scene/WanderingSpotlight";
import { CursorTrail } from "@/components/scene/CursorTrail";
import { LiveTicker, type TickerEntry } from "@/components/scene/LiveTicker";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { SubmittingOverlay } from "./SubmittingOverlay";
import { PitchCoach } from "./PitchCoach";
import { PitchAttachments, type Attachment } from "./PitchAttachments";
import { SUBMIT_LIMITS } from "@/lib/score-schema";

const FRAMES_1_COUNT = 91;
const FRAMES_2_COUNT = 90;
const FRAMES_3_COUNT = 90;

// Server-fed shape produced in app/page.tsx and threaded through. Kept
// in HomeScene because all consumers below the cinematic frames live in
// this client tree.
export type VerdictCard = {
  id: string;
  title: string;
  verdict: string;
  finalScore: number;
  href: string;
};

type HomeSceneProps = {
  pitchedThisSeason: number;
  built: number;
  verdicts: VerdictCard[];
  /** Recent scored submissions for the bottom "Latest tributes" row. Pre-
      filtered by the server to entries created within the last 7 days. */
  latestIdeas: TickerEntry[];
};

export function HomeScene({
  pitchedThisSeason,
  built,
  verdicts,
  latestIdeas,
}: HomeSceneProps) {
  return (
    <MotionConfig reducedMotion="user">
      <>
        <MinimalistHeader />

      <main id="main" tabIndex={-1} className="scene relative bg-black">
        {/* Panel 1 — Capture. h-[200vh] gives the canvas a full 100vh of
            pinned scroll to scrub all 91 frames in front of the user before
            the panel hands off. Frame scrub completes during pin, not after. */}
        <HeroPanel
          image="/scene/firstimage.avif"
          framesPath="/scene/frames-1"
          frameCount={FRAMES_1_COUNT}
          heightVh={200}
          alt=""
          tone="dark"
          priority
          id="capture"
        >
          <Panel1 />
        </HeroPanel>

        {/* Panel 2 — Judge. Same 200vh treatment so the frames-2 sequence
            (90 frames) plays out in the centered viewport while pinned. */}
        <HeroPanel
          image="/scene/transition-poster.avif"
          framesPath="/scene/frames-2"
          frameCount={FRAMES_2_COUNT}
          heightVh={200}
          alt=""
          tone="dark"
          id="judge"
        >
          <Panel2 />
        </HeroPanel>

        {/* Panel 3 — Winner. Same 200vh treatment as the earlier panels:
            scrubs 90 frames from /scene/frames-3 (extracted from
            public/scene/last.mp4) across the pinned portion. The at-rest
            image is the first frame of the sequence so the panel→canvas
            handoff is byte-identical at the boundary. */}
        <HeroPanel
          image="/scene/frames-3/001.avif"
          framesPath="/scene/frames-3"
          frameCount={FRAMES_3_COUNT}
          heightVh={200}
          alt=""
          tone="dark"
          id="rules"
        >
          <Panel3 />
        </HeroPanel>

        {/* ── post-cinema info sections ──────────────────────────────
           After the third sticky panel the cinematic feel breaks. These
           sections use simpler reveal animations and stop pinning so
           founders can absorb the offer at their own pace. */}
        <HowItWorks />
        {/* Last week's verdicts — only renders when at least one
            scored idea exists. Sits between HowItWorks and
            WeeklyStakes so it reads as evidence after the explanation
            and before the rules. */}
        {verdicts.length > 0 && <LastWeekVerdicts verdicts={verdicts} />}
        <WeeklyStakes
          pitchedThisSeason={pitchedThisSeason}
          built={built}
        />
        <AntiAbusePromise />
        <FinalCTA />
        {/* "Latest tributes" — recent scored ideas with relative
            timestamps. Server-filtered to ≤7 days old, so a slow week
            silently hides this section instead of reading stale. */}
        <LiveTicker entries={latestIdeas} />

        {/* persistent corner sparkle */}
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8">
          <CornerSparkle size={26} />
        </div>
      </main>
      </>
    </MotionConfig>
  );
}

/* ════════════════════════ Panel 1: Capture ═════════════════════════
 * Layout zones (vertical %, viewport-relative):
 *   ~6%  kicker
 *   ~12% headline      ← above the hourglass (which the image renders at ~30%)
 *   30%  [image: hourglass]
 *   ~42% countdown     ← directly under the hourglass
 *   55%  [image: input pill]
 *   ~58% real input    ← overlays the image's input shape
 *   ~78% subtitle / CTAs
 * ────────────────────────────────────────────────────────────────── */
const PITCH_DRAFT_KEY = "pitch-pit:home-pitch-draft";

function Panel1() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  // A11y-4: focus the textarea on any validation/submit error so the user
  // lands on the field they need to fix without hunting for it.
  const pitchRef = useRef<HTMLTextAreaElement | null>(null);

  // Touch-device detection runs once after mount. Drives:
  //   - Enter behavior (mobile: newline; desktop: submit)
  //   - enterKeyHint (mobile shows a "send" affordance only when Cmd/Ctrl
  //     also serves as the submit shortcut, so we use "enter" for newline)
  //   - scrollIntoView on focus to outrun the iOS keyboard hiding the input
  //   - Counter copy ("⌘+enter" vs "enter to enter the pit")
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsCoarsePointer(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Seed from localStorage on mount. Initial state stays "" so server-rendered
  // markup matches client first paint — we only hydrate the draft after.
  // ALSO handles the post-login resume path: if the user came back from
  // /login with ?resume=1 and the saved draft is submission-ready, fire
  // submit() with the restored text directly so they don't have to click
  // again. Strips ?resume=1 from the URL so a refresh doesn't re-submit.
  useEffect(() => {
    let saved = "";
    try {
      saved = window.localStorage.getItem(PITCH_DRAFT_KEY) ?? "";
    } catch {
      // localStorage may be unavailable (private mode, disabled storage,
      // SSR edge cases). Draft persistence is best-effort.
    }
    if (saved.length > 0) setText(saved);

    // Resume detection. We only auto-submit if the URL says ?resume=1 AND
    // the saved draft passes the same client-side length gate the user
    // would face on a fresh submit.
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("resume") === "1" &&
      saved.trim().length >= SUBMIT_LIMITS.pitchMin
    ) {
      window.history.replaceState({}, "", window.location.pathname);
      // Pass the text directly — React state hasn't reflected setText yet.
      void submit(saved);
    }
    // submit() is intentionally not in deps; we want this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror every change to localStorage. Strings ≤3500 chars; sync write is
  // cheap enough that a debounce buys nothing.
  useEffect(() => {
    try {
      window.localStorage.setItem(PITCH_DRAFT_KEY, text);
    } catch {
      // ignore — see note above
    }
  }, [text]);

  // Autosize the textarea so users can SEE what they've typed. The original
  // rows={1} + scrollable internal overflow meant the user had a one-line
  // peephole into a 60-3500 char draft — punishing on mobile especially.
  // Sizing rules:
  //   at-rest empty + unfocused → ~1 line (preserves at-rest alignment with
  //     the painted input pill in the bg image — critical for the cinematic)
  //   focused or any text typed → floor at ~3 lines (reads as a textarea,
  //     gives mobile users vertical room to drag/select)
  //   typing → grows to fit content, capped at ~6 lines (above which the
  //     internal scrollbar kicks in so the panel layout doesn't blow out)
  useEffect(() => {
    const el = pitchRef.current;
    if (!el) return;
    el.style.height = "auto";
    const isActive = isFocused || text.length > 0;
    const floorPx = isActive ? 72 : 26;
    const ceilPx = 158;
    const next = Math.min(Math.max(el.scrollHeight, floorPx), ceilPx);
    el.style.height = `${next}px`;
  }, [text, isFocused]);

  function deriveTitle(input: string): string {
    const trimmed = input.trim();
    const firstSentence = trimmed.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= SUBMIT_LIMITS.titleMax)
      return firstSentence;
    return trimmed.slice(0, 60).trim() || trimmed.slice(0, SUBMIT_LIMITS.titleMax);
  }

  async function submit(textOverride?: string) {
    // textOverride is used by the post-login resume path (mount effect
    // below) where the draft has been restored from localStorage but
    // React state hasn't propagated yet. Anywhere else, undefined ↦
    // current state.
    const source = textOverride ?? text;
    const trimmed = source.trim();
    if (trimmed.length < SUBMIT_LIMITS.pitchMin) {
      setError(`Be more specific — at least ${SUBMIT_LIMITS.pitchMin} characters.`);
      pitchRef.current?.focus();
      return;
    }
    setError(null);

    // ─── anonymous-first submit path ───────────────────────────
    // The auth wall used to live here: a getSession() check that
    // bounced logged-out users to /login before they ever saw the
    // judges. We deliberately removed it. The server (/api/draft)
    // is authoritative — it allows anonymous drafts, sets an
    // HttpOnly claim cookie, and only the eventual /api/claim-idea
    // call requires auth. The localStorage draft + ?resume=1 flow
    // remains in the mount effect above as a safety net (e.g. when
    // the user proactively signs in BEFORE pitching, gets bounced
    // through OAuth, and we want their typed text restored on
    // return) — it's redundant for the success path but does no
    // harm.
    // Mint ONE idempotency key per submit attempt. The same uuid travels
    // with this fetch even if React's startTransition or a network blip
    // re-fires the inner async — the server will return the existing
    // draft instead of minting a duplicate. A fresh attempt (user edits
    // and re-submits, or hits submit again after an error) generates a
    // new uuid below, so they're not stuck on a stale request.
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : undefined;
    startTransition(async () => {
      try {
        // Run Turnstile invisibly. No-op + empty string when site key is
        // unset (dev/preview without a Cloudflare account).
        let turnstileToken = "";
        try {
          turnstileToken = (await turnstileRef.current?.execute()) ?? "";
        } catch (e) {
          // Surface the diagnostic message produced by Turnstile.tsx
          // (timeout / cloudflare error code / load failure). Fall back
          // to the generic line only if the error somehow isn't an Error.
          throw new Error(
            e instanceof Error
              ? e.message
              : "Couldn't verify you're human. Refresh the page and try again.",
          );
        }

        // Stage the pitch as a draft (server validates + content-filters +
        // captures session). The three judges run inside /judge/[token]
        // as Suspense-streamed async server components.
        const res = await fetch("/api/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: deriveTitle(trimmed),
            pitch: trimmed,
            handle: "",
            turnstile_token: turnstileToken,
            ...(requestId ? { request_id: requestId } : {}),
            // Only completed uploads (uploaded === true, no error)
            // are forwarded; in-flight + errored attachments are
            // dropped silently. Schema caps at 3.
            image_urls: attachments
              .filter((a) => !a.uploading && !a.error && a.url)
              .map((a) => a.url),
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            redirect_to?: string;
            category?: string;
          };
          turnstileRef.current?.reset();
          // Server still emits redirect_to in legacy auth scenarios
          // (e.g. a future re-introduction of the auth wall). Honor it
          // when present so the client doesn't have to know the rules.
          if (res.status === 401 && err.redirect_to) {
            router.push(err.redirect_to);
            return;
          }
          throw new Error(err.error ?? "Submission failed.");
        }
        const { token } = (await res.json()) as { token: string };
        try {
          window.localStorage.removeItem(PITCH_DRAFT_KEY);
        } catch {
          // ignore
        }
        router.push(`/judge/${token}`);
      } catch (e) {
        // Surface to the user AND to Sentry. The local setError shows the
        // message in the bottom counter line; Sentry needs the explicit
        // capture because the error never propagates past this catch.
        Sentry.captureException(e, {
          tags: { surface: "home-submit", phase: "client-fetch" },
          extra: { request_id: requestId, has_attachments: attachments.length > 0 },
        });
        setError(e instanceof Error ? e.message : "Something went wrong.");
        pitchRef.current?.focus();
      }
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // Desktop: Enter submits, Shift+Enter is a newline (kept for muscle memory).
    // Touch: plain Enter inserts a newline so mobile users can write actual
    // paragraphs; only Cmd/Ctrl+Enter submits. The on-screen "Submit" tile
    // is the primary submit affordance on mobile.
    if (isCoarsePointer) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (!e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Touch devices: pull the input above the keyboard once it's settled.
  // 320ms covers the iOS Safari keyboard-open animation; we kick it after
  // setIsFocused so the textarea has already grown to its 3-line floor.
  function handleFocus() {
    setIsFocused(true);
    if (!isCoarsePointer) return;
    window.setTimeout(() => {
      pitchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 320);
  }

  const length = text.trim().length;

  // Refs for atmospheric flair effects. Panel1 is the only panel that
  // gets the ambient layer (spotlight + cursor trail + sand drift +
  // milestone pulse on input). The cursor trail listens on `panelRef`,
  // milestone pulse mutates the data attribute on `inputShellRef`.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputShellRef = useRef<HTMLDivElement | null>(null);

  return (
    // Layout-1: floor at 640px tall so the kicker / countdown / input
    // never overlap on iPhone SE-class viewports (568px height with the
    // address bar shown). Above that, the absolute % offsets fan out
    // naturally to the section height.
    <div ref={panelRef} className="relative h-full min-h-[640px] w-full">
      {/* Atmospheric flair layer — diffuse drifting gold spotlight, slow
          gold-sand drift over the painted hourglass, and a tiny cursor
          trail. All pointer-events-none, all aria-hidden, all live
          behind the cinematic content (z-5..z-8). Reduced-motion pins
          spotlight to centered glow and skips sand + trail entirely. */}
      <WanderingSpotlight />
      <HourglassSand />
      <CursorTrail panelRef={panelRef} />

      {/* TOP — kicker + headline (above the image's hourglass) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="absolute inset-x-0 top-[max(96px,7%)] flex flex-col items-center px-6 text-center"
        style={{ zIndex: 10 }}
      >
        <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-white/55 sm:text-[0.92rem]">
          ↘ The pit closes Monday at midnight EST
        </p>
        <h1 className="mt-5 max-w-3xl text-balance text-[2rem] font-medium leading-[1.04] text-white sm:text-5xl lg:text-6xl">
          Pitch your idea. The{" "}
          <FoilSweep>
            <span className="italic text-[var(--scene-gold-bright)]">
              winner
            </span>
          </FoilSweep>{" "}
          gets built.
        </h1>
      </motion.div>

      {/* MID-UPPER — countdown. Originally at top-[42%] to sit below
          the bg image's hourglass at ~30%. Bumped to top-[32%] so the
          form below has clearance to grow the pitch coach upward when
          the user types — without pushing the input off-screen. The
          slight overlap with the hourglass is acceptable since the
          cinematic bg crossfades to the canvas as soon as the user
          starts scrolling anyway. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="absolute inset-x-0 top-[32%] mx-auto flex max-w-md flex-col items-center px-6"
        style={{ zIndex: 10 }}
      >
        <CountdownClock />
      </motion.div>

      {/* MID — real input. At-rest target around the upper-center of the
          panel — high enough that the pitch coach (which grows the form
          upward as a sibling in normal flow) doesn't push the input
          off the bottom subtitle, low enough that the at-rest layout
          doesn't feel top-heavy. top-[52%] threads that needle: empty
          pitch lands the input slightly past mid-viewport; coach open
          shifts it to ~70%/viewport on desktop, ~85% on iPhone SE —
          still clear of the bottom subtitle at bottom-[8%] (=92%). */}
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        // max-w bumped from 2xl (672px) → arbitrary 740px (+~10%) so
        // the input is visibly wider, matching the size bump the user
        // requested. Inner padding is also bumped 10% on the input
        // shell below.
        className="absolute inset-x-0 top-[52%] mx-auto w-full max-w-[740px] px-6"
        style={{ zIndex: 10 }}
      >
        {/* Pitch coach — above the input. Quality checks, AI follow-ups,
            and an opt-in "polish my pitch" enhancer. Visible once the
            user starts typing; hidden otherwise so the at-rest layout
            stays aligned with the bg image's input pill. The
            data-pitch-coach attribute opts the whole subtree out of the
            cursor-trail effect (the coach has its own gold treatment). */}
        <div className="mb-4" data-pitch-coach>
          <PitchCoach text={text} setText={setText} />
        </div>
        {/* Two-piece input row to match the design ref:
              .scene-input-shell — rounded-rect glass that wraps ONLY
              the textarea. Padding ~10% larger than original.
              .scene-submit — standalone glass-tile button as a sibling,
              separated by a small gap so the two pieces read as
              discrete elements rather than a unified pill. */}
        <div className="flex items-stretch gap-3">
          <div
            ref={inputShellRef}
            className="scene-input-shell flex flex-1 items-center px-[1.375rem] py-[0.875rem] sm:px-[1.625rem] sm:py-[1.125rem]"
          >
            {/* Milestone FX: pulses the shell (data-pulse) + emits a
                gold spark from the bottom-right corner whenever the
                user crosses 60 / 300 / 1500 chars from below. */}
            <InputMilestoneFX shellRef={inputShellRef} length={length} />
            <div className="relative flex flex-1 items-center">
              {length === 0 && (
                <span
                  aria-hidden
                  className="scene-cursor pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"
                />
              )}
              <textarea
                ref={pitchRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={onKey}
                onFocus={handleFocus}
                onBlur={() => setIsFocused(false)}
                disabled={pending}
                autoCorrect="off"
                spellCheck="true"
                rows={1}
                maxLength={SUBMIT_LIMITS.pitchMax}
                aria-label="Pitch your idea"
                autoComplete="off"
                inputMode="text"
                // Touch: "enter" so the on-screen keyboard's return key
                // inserts a newline (we suppress submit-on-Enter for
                // coarse pointers, see onKey). Desktop: "send" surfaces
                // the submit affordance on hardware keyboards that honor
                // the hint.
                enterKeyHint={isCoarsePointer ? "enter" : "send"}
                className="scene-input pl-3"
                // Floor/ceiling for the autosize effect above. The effect
                // sets explicit height in px on every text/focus change;
                // these inline values are the static fallback before that
                // effect first runs (e.g. SSR + first paint).
                style={{ minHeight: "1.65rem", maxHeight: "9.9rem" }}
              />
              {length === 0 && !pending && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-white/55"
                >
                  Pitch your idea…
                </span>
              )}
              {pending && length === 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-white/45"
                >
                  Judging…
                </span>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || length === 0}
            aria-label={pending ? "Judging" : "Submit"}
            className="scene-submit"
          >
            {pending ? <Spinner /> : <PaperPlane />}
          </button>
        </div>
        {/* Invisible captcha — only renders when NEXT_PUBLIC_TURNSTILE_SITE_KEY
            is set, no-op otherwise. Triggered via ref.current.execute() inside
            submit(). Most legitimate users see nothing; suspicious sessions
            get a Cloudflare interaction prompt. */}
        <Turnstile handleRef={turnstileRef} />

        {/* Image attachments + voice input. Sits below the input shell
            so the textarea stays anchored at top-[52%]; thumbnails grow
            downward into the gap above the bottom subtitle. The mic
            uses Web Speech API and is hidden in browsers that don't
            support it (Firefox, older Safari). */}
        <div className="mt-3">
          <PitchAttachments
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onAppendText={(extra) =>
              setText((prev) => (prev.trim() ? `${prev.trim()} ${extra}` : extra))
            }
            disabled={pending}
          />
        </div>

        {/* Template chips removed — they were colliding with the bottom
            counter on shorter viewports. ExpressLane was also relocated
            out of the form (see below the bottom counter) to keep the
            form's vertical extent short enough that the counter doesn't
            crash into form-internal helpers on portrait viewports. */}
      </motion.form>

      {/* Full-screen overlay during submit. Bridges the ~600ms window
          between click and the /judge/[token] navigation; that route's
          loading.tsx then takes over without a visible seam. */}
      <SubmittingOverlay visible={pending} />

      {/* BOTTOM — live counter + scroll cue (input is the singular primary CTA;
          secondary nav lives in the header now, not above-the-fold) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-5 px-6 text-center"
        style={{ zIndex: 10 }}
      >
        <p
          className={`scene-mono text-[0.65rem] uppercase tracking-[0.35em] sm:text-[0.65rem] ${
            error
              ? "text-red-300/85"
              : length > 0 && length < SUBMIT_LIMITS.pitchMin
                ? "text-[var(--scene-gold-bright)]"
                : length > SUBMIT_LIMITS.pitchMax * 0.9
                  ? "text-amber-200/85"
                  : "text-white/45"
          }`}
          role={error ? "alert" : undefined}
        >
          {error
            ? error
            : pending
              ? "↘ The machine is judging"
              : length === 0
                ? isCoarsePointer
                  ? `Tap to pitch · ${SUBMIT_LIMITS.pitchMin}-${SUBMIT_LIMITS.pitchMax} chars`
                  : `Press enter to enter the pit · ${SUBMIT_LIMITS.pitchMin}-${SUBMIT_LIMITS.pitchMax} chars`
                : length < SUBMIT_LIMITS.pitchMin
                  ? `${SUBMIT_LIMITS.pitchMin - length} more to enter the pit · ${length}/${SUBMIT_LIMITS.pitchMax}`
                  : isCoarsePointer
                    ? `${length}/${SUBMIT_LIMITS.pitchMax} · tap submit to enter the pit`
                    : `${length}/${SUBMIT_LIMITS.pitchMax} · enter to enter the pit`}
        </p>
        {/* Express-lane secondary CTA — lives next to the primary
            counter line so it reads as an alternative entry path
            (subordinated, not competing). Hides while submitting; the
            counter line above carries the loading copy in that state. */}
        {!pending && (
          <ExpressLane
            disabled={pending}
            onDraftReady={(draft) => {
              setText(draft);
              pitchRef.current?.focus();
            }}
          />
        )}
        <ScrollCue />
      </motion.div>
    </div>
  );
}

/* ════════════════════════ Panel 2: Judge ════════════════════════════
 * Layout: small kicker top, headline above image's hourglass (centered),
 *         glass stat cards bottom (replacing image's progress bars visually).
 * ────────────────────────────────────────────────────────────────────── */
function Panel2() {
  return (
    <div className="relative h-full w-full">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.7 }}
        className="absolute inset-x-0 top-[10%] flex flex-col items-center px-6 text-center"
      >
        <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
          ↘ How it&rsquo;s judged
        </p>
        <h2 className="mt-5 max-w-3xl text-balance text-[2rem] font-medium leading-[1.04] text-white sm:text-5xl lg:text-6xl">
          AI judges.{" "}
          <span className="italic text-[var(--scene-gold-bright)]">
            The crowd votes.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
          Every idea is scored on six dimensions by an AI gamemaster, then
          weighted with the community vote.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="absolute inset-x-0 bottom-[10%] mx-auto flex max-w-3xl flex-col items-center px-6"
      >
        <div className="grid w-full grid-cols-2 gap-4 sm:gap-5">
          <div className="scene-card px-5 py-4 text-center">
            <p className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-[var(--scene-gold)]">
              machine
            </p>
            <p className="scene-mono mt-2 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
              50%
            </p>
            <p className="mt-1 text-xs text-white/55">AI rubric · 0–100</p>
          </div>
          <div className="scene-card px-5 py-4 text-center">
            <p className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-white/65">
              crowd
            </p>
            <p className="scene-mono mt-2 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
              50%
            </p>
            <p className="mt-1 text-xs text-white/55">Public votes · live</p>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link href="/leaderboard" className="cta-btn-primary text-sm">
            See the leaderboard <span aria-hidden>→</span>
          </Link>
          <Link href="/rules" className="cta-btn-ghost text-sm">
            How scoring works
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

/* ════════════════════════ Panel 3: Winner ═══════════════════════════
 * Layout: kicker + headline at top, supporting stats and CTAs at bottom.
 *         Image's tablet/coins composition fills the middle.
 * ────────────────────────────────────────────────────────────────────── */
function Panel3() {
  return (
    <div className="relative h-full w-full">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.7 }}
        className="absolute inset-x-0 top-[10%] flex flex-col items-center px-6 text-center"
      >
        <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
          ↘ The pact
        </p>
        <h2 className="mt-5 max-w-3xl text-balance text-[2rem] font-medium leading-[1.04] text-white sm:text-5xl lg:text-6xl">
          One winner.{" "}
          <span className="italic text-[var(--scene-gold-bright)]">
            One build.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
          Two submissions per person, per week. The top final score wins.
          We build the MVP, broadcast under your name.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="absolute inset-x-0 bottom-[10%] mx-auto flex max-w-2xl flex-col items-center px-6"
      >
        <div className="grid w-full grid-cols-3 gap-3 sm:gap-4">
          <Stat label="Submissions / wk" value="2" tone="gold" />
          <Stat label="Window" value="7d" />
          <Stat label="Winners / wk" value="1" tone="gold" />
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link href="/submissions" className="cta-btn-primary text-sm">
            Pitch your idea <span aria-hidden>→</span>
          </Link>
          <Link href="/built" className="cta-btn-ghost text-sm">
            See past builds
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

/* ════════════════════════ How it works ═════════════════════════════
 * Four-step explanation of the contest cycle. Numbered, staggered reveal,
 * 2-column grid on tablet+, stacked on mobile.
 * ────────────────────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Submit your pitch",
      body: "60 to 3500 characters. Anyone can pitch — anonymous or signed in. Two submissions per week if you sign in; one IP-rate-limited slot if you don't.",
    },
    {
      n: 2,
      title: "Claude rates it",
      body: "Opus 4.7 evaluates your pitch against the YC office-hours rubric — demand, wedge, founder edge, feasibility, defensibility, distribution. Score 1–10 with strengths, concerns, and reasoning.",
    },
    {
      n: 3,
      title: "The community votes",
      body: "Every signed-in user gets one vote per pitch. Your final score is 50% AI + 50% community, normalized 0–100. Live realtime updates while voting is open.",
    },
    {
      n: 4,
      title: "Win the week",
      body: "The pit closes Monday at midnight EDT. The week's top final score gets built — for free, no equity, no strings — and we ship the live MVP under your name.",
    },
  ];

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="relative bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-36"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>The process</SectionKicker>
        <h2
          id="how-it-works-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          How a pitch becomes a build.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Four steps. One week. No interviews, no decks, no warm intros.
        </p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6">
          {steps.map((s, i) => (
            <motion.article
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.5, delay: 0.08 * i }}
              className="scene-card flex gap-5 px-6 py-6 sm:px-7 sm:py-7"
            >
              <span
                aria-hidden
                className="scene-mono mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--scene-gold)]/45 bg-[var(--scene-gold)]/10 text-sm font-semibold tabular-nums text-[var(--scene-gold-bright)]"
              >
                {s.n}
              </span>
              <div>
                <h3 className="text-lg font-medium text-white sm:text-xl">
                  {s.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-white/72">
                  {s.body}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════ Weekly stakes ═════════════════════════════
 * Compact stats row that reinforces the rules summary from Panel 3 with
 * more concrete numbers. Dense, scannable, pure data. The live counter
 * strip at the top is fed from server-rendered Supabase counts so
 * visitors see real activity (or honest "just opened" copy when the
 * pit is brand-new).
 * ────────────────────────────────────────────────────────────────────── */
function WeeklyStakes({
  pitchedThisSeason,
  built,
}: {
  pitchedThisSeason: number;
  built: number;
}) {
  const stakes = [
    { label: "Submissions / week", value: "2", note: "per signed-in user" },
    { label: "Voting window", value: "7d", note: "Sat 00:00 → Fri 23:59 EDT" },
    { label: "AI weight", value: "50%", note: "Sonnet 4.6, six dimensions" },
    { label: "Community weight", value: "50%", note: "1 vote / user / pitch" },
    { label: "Winners / week", value: "1", note: "highest final score" },
    { label: "Prize", value: "Free build", note: "MVP shipped under your name" },
  ];

  return (
    <section
      aria-labelledby="stakes-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>This week&rsquo;s stakes</SectionKicker>
        <h2
          id="stakes-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          The numbers behind the pit.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Plain rules, no fine print. Read them once and pitch.
        </p>

        {/* Live counter strip — real numbers from Supabase, cached
            for 60s. Honest fallback copy when the pit is empty so
            we never lie with a "0 ideas pitched" line. */}
        <LiveCounter
          pitchedThisSeason={pitchedThisSeason}
          built={built}
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {stakes.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.45, delay: 0.05 * i }}
              className="scene-card flex flex-col px-6 py-6"
            >
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-[var(--scene-gold)]">
                {s.label}
              </p>
              <p className="scene-mono mt-3 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-2 text-sm leading-snug text-white/55">
                {s.note}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="scene-mono mt-10 text-xs uppercase tracking-[0.3em] text-white/55">
          Full rubric and edge cases on the{" "}
          <Link href="/rules" className="text-white/70 underline-offset-4 hover:text-white hover:underline">
            rules page →
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════ Anti-abuse promise ════════════════════════
 * Trust-building. Names what we screen for so founders know their pitch
 * isn't competing with low-effort spam. Calmer rhythm, single column.
 * ────────────────────────────────────────────────────────────────────── */
function AntiAbusePromise() {
  const guards = [
    {
      title: "Prompt-injection screening",
      body: "Submissions that try to manipulate the reviewer (\"ignore previous instructions\", system tokens, jailbreak attempts) are rejected before they reach Claude. Your honest pitch isn't competing against tricks.",
    },
    {
      title: "Per-user weekly cap",
      body: "Two submissions per week per signed-in user. Anonymous submissions are IP rate-limited. No flooding the feed from one account.",
    },
    {
      title: "Quality floor",
      body: "Pitches under 60 characters, all-caps shouting, repeated-character spam, and copy-paste filler are rejected. The reviewer only sees real ideas — so do the voters.",
    },
    {
      title: "Hate speech filter",
      body: "Slurs and targeted harassment are blocked at submit. Beyond the regex layer, Claude flags policy violations (doxxing, CSAM, instructions for serious harm, explicit fraud) and refuses to score them.",
    },
  ];

  return (
    <section
      aria-labelledby="antiabuse-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <SectionKicker>The promise</SectionKicker>
        <h2
          id="antiabuse-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          Your pitch competes against ideas — not noise.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-white/65 sm:text-lg">
          We run four screens before any submission reaches the leaderboard.
          Real founders deserve a real signal.
        </p>

        <ul className="mt-14 space-y-5">
          {guards.map((g, i) => (
            <motion.li
              key={g.title}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.5, delay: 0.07 * i }}
              className="scene-card flex gap-5 px-6 py-6 sm:px-7 sm:py-7"
            >
              <CheckMark />
              <div>
                <h3 className="text-base font-medium text-white sm:text-lg">
                  {g.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/72 sm:text-base">
                  {g.body}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ════════════════════════ Final CTA ═════════════════════════════════
 * After they've absorbed the offer, one last "pitch your idea" moment.
 * No image, no animation theatrics — just the offer, big and quiet.
 * ────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 text-center sm:px-10 sm:py-36">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.7 }}
        className="mx-auto max-w-2xl"
      >
        <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
          ↘ Your move
        </p>
        <h2 className="mt-5 text-balance text-3xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
          The pit is open.{" "}
          <span className="italic text-[var(--scene-gold-bright)]">
            Pitch your idea.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
          60 characters minimum. Two submissions per week. No equity, no fees.
          Monday at midnight, one winner walks out with a build.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="#capture" className="cta-btn-primary text-base">
            Pitch your idea <span aria-hidden>↑</span>
          </a>
          <Link href="/leaderboard" className="cta-btn-ghost text-base">
            See this week&rsquo;s leaderboard
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════ Live counter strip ═══════════════════════
 * Two real numbers from Supabase: pitched-this-season, built. Falls
 * back to honest "just opened / waiting" copy when the pit is brand-new
 * so we never emit "0 ideas pitched". Sits at the top of WeeklyStakes.
 * ────────────────────────────────────────────────────────────────────── */
function LiveCounter({
  pitchedThisSeason,
  built,
}: {
  pitchedThisSeason: number;
  built: number;
}) {
  // Honest fallback. The mission says: "If counts are zero, use copy
  // that doesn't lie ('Just opened' / 'Waiting for the first builds')
  // rather than emit '0 ideas pitched.'"
  const pitchedLabel =
    pitchedThisSeason > 0
      ? `${pitchedThisSeason.toLocaleString("en-US")} ${pitchedThisSeason === 1 ? "idea" : "ideas"} pitched this season`
      : "Just opened";
  const builtLabel =
    built > 0
      ? `${built.toLocaleString("en-US")} ${built === 1 ? "build" : "builds"} shipped`
      : "Waiting for the first builds";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.5 }}
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-gold)] shadow-[0_0_10px_rgba(255,184,0,0.85)]"
      />
      <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/72">
        {pitchedLabel}
        <span aria-hidden className="mx-2 text-white/35">
          ·
        </span>
        {builtLabel}
      </p>
    </motion.div>
  );
}

/* ════════════════════════ Last week's verdicts ═════════════════════
 * Up to 3 cards from scored+ ideas, ordered by final_score desc. Pulls
 * the title, verdict (one-line quote), final_score, and a slugged link
 * for SEO. Section omits itself entirely when no scored ideas exist
 * (handled by the parent, see HomeScene).
 * ────────────────────────────────────────────────────────────────────── */
function LastWeekVerdicts({ verdicts }: { verdicts: VerdictCard[] }) {
  return (
    <section
      aria-labelledby="last-week-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>Last week&rsquo;s verdicts</SectionKicker>
        <h2
          id="last-week-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          What the judges said.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          One-line takes from the highest-scoring pitches so far. Click
          through for the full rubric and reasoning.
        </p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {verdicts.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.45, delay: 0.06 * i }}
              className="scene-card group transition-colors hover:border-[var(--scene-gold)]/45"
            >
              <Link
                href={v.href}
                className="block px-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-base font-medium leading-snug text-white group-hover:text-[var(--scene-gold-bright)] sm:text-lg">
                    {v.title}
                  </h3>
                  <span
                    className="scene-mono flex-shrink-0 text-2xl font-semibold tabular-nums leading-none text-[var(--scene-gold-bright)]"
                    aria-label={`Final score ${v.finalScore} of 100`}
                  >
                    {v.finalScore}
                  </span>
                </div>
                {v.verdict && (
                  <p className="mt-4 text-sm leading-relaxed text-white/72">
                    &ldquo;{v.verdict}&rdquo;
                  </p>
                )}
                <p className="scene-mono mt-5 inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-[0.32em] text-white/55 group-hover:text-[var(--scene-gold)]">
                  Read the full verdict
                  <span aria-hidden>→</span>
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════ Express-lane (one-sentence draft) ═════════
 * Small text link below the input that reveals a 1-line / 280-char
 * input. POSTs to /api/pitch-coach action=expand and pipes the result
 * into the main textarea on success. Matches the polish flow's auth
 * 401 redirect convention. Bails loud when the seed is < 8 chars.
 * ────────────────────────────────────────────────────────────────────── */
const EXPRESS_LANE_MIN = 8;
const EXPRESS_LANE_MAX = 280;
function ExpressLane({
  disabled,
  onDraftReady,
}: {
  disabled: boolean;
  onDraftReady: (draft: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input when the panel opens — saves a click and signals
  // to the user that this is a real lane, not just a label.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function expand() {
    const trimmed = seed.trim();
    if (trimmed.length < EXPRESS_LANE_MIN) {
      setError(
        `Give me at least ${EXPRESS_LANE_MIN} characters — what's the idea?`,
      );
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pitch-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", seed: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          redirect_to?: string;
        };
        if (res.status === 401 && err.redirect_to) {
          router.push(err.redirect_to);
          return;
        }
        throw new Error(err.error ?? "Couldn't draft from your one-liner.");
      }
      const data = (await res.json()) as { draft?: string };
      if (!data.draft) throw new Error("Coach returned an empty draft.");
      onDraftReady(data.draft);
      setSeed("");
      setOpen(false);
    } catch (e) {
      Sentry.captureException(e, {
        tags: { surface: "express-lane", phase: "expand" },
      });
      setError(e instanceof Error ? e.message : "Couldn't draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="scene-mono inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.28em] text-white/55 transition-colors hover:text-[var(--scene-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)] disabled:opacity-60"
        >
          Or describe in one sentence and I&rsquo;ll draft it
          <span aria-hidden>→</span>
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/55"
              >
                Express lane
              </span>
              <div className="flex flex-1 items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={seed}
                  onChange={(e) => {
                    setSeed(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void expand();
                    } else if (e.key === "Escape") {
                      setOpen(false);
                      setSeed("");
                      setError(null);
                    }
                  }}
                  disabled={loading || disabled}
                  maxLength={EXPRESS_LANE_MAX}
                  aria-label="Describe your idea in one sentence"
                  placeholder="markdown spec → scaffold for indie devs"
                  className="scene-input min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--scene-gold)]/45 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void expand()}
                  disabled={loading || disabled}
                  className="scene-mono inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--scene-gold)]/15 px-4 text-[0.6rem] font-medium uppercase tracking-[0.32em] text-[var(--scene-gold)] transition-all hover:bg-[var(--scene-gold)]/25 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
                >
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-3 w-3" aria-hidden />
                  )}
                  {loading ? "Drafting…" : "Draft it"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSeed("");
                    setError(null);
                  }}
                  disabled={loading}
                  className="scene-mono text-[0.6rem] uppercase tracking-[0.28em] text-white/55 transition-colors hover:text-white/85"
                >
                  Cancel
                </button>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="scene-mono mt-2 text-[0.6rem] uppercase tracking-[0.18em] text-red-300/85"
              >
                {error}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/* ─── shared helpers ──────────────────────────────────────────────── */
function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="scene-mono text-[0.65rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.92rem]">
      {children}
    </p>
  );
}

function CheckMark() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--scene-gold)]/45 bg-[var(--scene-gold)]/10"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 7.5 L6 10.5 L11.5 4.5"
          stroke="var(--scene-gold-bright)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "gold" | "neutral";
}) {
  return (
    <div className="scene-card px-3 py-3 text-center">
      <p
        className="scene-mono text-2xl font-semibold tabular-nums leading-none sm:text-3xl"
        style={{
          color: tone === "gold" ? "var(--scene-gold-bright)" : "white",
        }}
      >
        {value}
      </p>
      <p className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
        {label}
      </p>
    </div>
  );
}

function ScrollCue() {
  return (
    <span
      aria-hidden
      className="scroll-cue scene-mono inline-flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.4em] text-white/55"
    >
      Scroll <span className="text-base">↓</span>
    </span>
  );
}

function PaperPlane() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M22 3 L11 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 3 L15 21 L11 14 L4 10 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="rgba(40, 24, 0, 0.15)"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="motion-safe:animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M21 12 a9 9 0 0 0 -9 -9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
