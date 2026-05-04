"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { HeroPanel } from "@/components/scene/HeroPanel";
import { CountdownClock } from "@/components/scene/CountdownClock";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { SUBMIT_LIMITS } from "@/lib/score-schema";

const FRAMES_1_COUNT = 91;
const FRAMES_2_COUNT = 90;

export function HomeScene() {
  return (
    <>
      <MinimalistHeader />

      <main id="main" className="scene relative bg-black">
        {/* Panel 1 — Capture. h-[200vh] gives the canvas a full 100vh of
            pinned scroll to scrub all 91 frames in front of the user before
            the panel hands off. Frame scrub completes during pin, not after. */}
        <HeroPanel
          image="/scene/firstimage.png"
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
          image="/scene/raking.png"
          framesPath="/scene/frames-2"
          frameCount={FRAMES_2_COUNT}
          heightVh={200}
          alt=""
          tone="dark"
          id="judge"
        >
          <Panel2 />
        </HeroPanel>

        {/* Panel 3 — Winner. Image only, single viewport — no extra
            scroll-padding since there's no animation to play out. */}
        <HeroPanel
          image="/scene/winbuiltapp.png"
          alt=""
          tone="dark"
          id="rules"
        >
          <Panel3 />
        </HeroPanel>

        {/* persistent corner sparkle */}
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8">
          <CornerSparkle size={26} />
        </div>
      </main>
    </>
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
function Panel1() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function deriveTitle(input: string): string {
    const trimmed = input.trim();
    const firstSentence = trimmed.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= SUBMIT_LIMITS.titleMax)
      return firstSentence;
    return trimmed.slice(0, 60).trim() || trimmed.slice(0, SUBMIT_LIMITS.titleMax);
  }

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < SUBMIT_LIMITS.pitchMin) {
      setError(`Be more specific — at least ${SUBMIT_LIMITS.pitchMin} characters.`);
      return;
    }
    setError(null);
    // One key per submission attempt — protects against double-charge if the
    // user retries on a network failure.
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    startTransition(async () => {
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            title: deriveTitle(trimmed),
            pitch: trimmed,
            handle: "",
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Submission failed.");
        }
        const { id } = (await res.json()) as { id: string };
        router.push(`/idea/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const length = text.trim().length;

  return (
    <div className="relative h-full w-full">
      {/* TOP — kicker + headline (above the image's hourglass) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="absolute inset-x-0 top-[7%] flex flex-col items-center px-6 text-center"
      >
        <p className="scene-mono text-[0.62rem] uppercase tracking-[0.45em] text-white/55 sm:text-[0.7rem]">
          ↘ The pit closes Friday at midnight EST
        </p>
        <h1 className="mt-5 max-w-3xl text-balance text-[2rem] font-medium leading-[1.04] text-white sm:text-5xl lg:text-6xl">
          Submit your{" "}
          <span className="italic text-[var(--scene-gold-bright)]">idea</span>.
        </h1>
      </motion.div>

      {/* MID-UPPER — countdown directly below the hourglass (image at ~30%) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="absolute inset-x-0 top-[42%] mx-auto flex max-w-md flex-col items-center px-6"
      >
        <CountdownClock />
      </motion.div>

      {/* MID — real input overlays the image's input pill (image at ~55%) */}
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="absolute inset-x-0 top-[58%] mx-auto w-full max-w-2xl px-6"
      >
        <div className="scene-input-shell flex items-center gap-3 px-5 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="relative flex flex-1 items-center">
            {length === 0 && (
              <span
                aria-hidden
                className="scene-cursor pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"
              />
            )}
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={onKey}
              disabled={pending}
              rows={1}
              maxLength={SUBMIT_LIMITS.pitchMax}
              aria-label="Pitch your idea"
              className="scene-input pl-3"
              style={{ minHeight: "1.5rem", maxHeight: "9rem" }}
            />
            {length === 0 && !pending && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-white/35"
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
          <button
            type="submit"
            disabled={pending || length === 0}
            aria-label={pending ? "Judging" : "Submit"}
            className="scene-submit"
          >
            {pending ? <Spinner /> : <PaperPlane />}
          </button>
        </div>
      </motion.form>

      {/* BOTTOM — live counter + scroll cue (input is the singular primary CTA;
          secondary nav lives in the header now, not above-the-fold) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-5 px-6 text-center"
      >
        <p
          className={`scene-mono text-[0.62rem] uppercase tracking-[0.35em] sm:text-[0.65rem] ${
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
                ? `Press enter to submit · ${SUBMIT_LIMITS.pitchMin}-${SUBMIT_LIMITS.pitchMax} chars`
                : length < SUBMIT_LIMITS.pitchMin
                  ? `${SUBMIT_LIMITS.pitchMin - length} more to submit · ${length}/${SUBMIT_LIMITS.pitchMax}`
                  : `${length}/${SUBMIT_LIMITS.pitchMax} · enter to submit`}
        </p>
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
        <p className="scene-mono text-[0.62rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.7rem]">
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
        <p className="scene-mono text-[0.62rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.7rem]">
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
          We build the MVP — broadcast under your name.
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
          <Link href="/submit" className="cta-btn-primary text-sm">
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
      <p className="scene-mono mt-2 text-[0.5rem] uppercase tracking-[0.3em] text-white/55">
        {label}
      </p>
    </div>
  );
}

function ScrollCue() {
  return (
    <span
      aria-hidden
      className="scroll-cue scene-mono inline-flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.4em] text-white/35"
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
