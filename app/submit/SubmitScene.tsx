"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "@/components/scene/Hourglass";
import { Particles } from "@/components/scene/Particles";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { SUBMIT_LIMITS } from "@/lib/score-schema";

export function SubmitScene() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function deriveTitle(input: string): string {
    const trimmed = input.trim();
    const firstSentence = trimmed.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= SUBMIT_LIMITS.titleMax) {
      return firstSentence;
    }
    return (
      trimmed.slice(0, 60).trim() || trimmed.slice(0, SUBMIT_LIMITS.titleMax)
    );
  }

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < SUBMIT_LIMITS.pitchMin) {
      setError(
        `Be more specific — at least ${SUBMIT_LIMITS.pitchMin} characters.`,
      );
      return;
    }
    setError(null);
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
    <>
      <MinimalistHeader />
      <main id="main" className="scene relative isolate min-h-dvh overflow-hidden">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam" />
        <div aria-hidden className="scene-beam-narrow" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto flex min-h-dvh max-w-4xl flex-col items-center justify-center px-6 py-32">
          {/* hourglass */}
          <div className="relative mb-10 sm:mb-12">
            <Hourglass size={108} />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-6 left-1/2 h-12 w-40 -translate-x-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,184,0,0.45) 0%, transparent 65%)",
                filter: "blur(8px)",
              }}
            />
          </div>

          {/* sacred input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="relative w-full max-w-2xl"
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
                  autoFocus
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

            <div className="mt-5 flex items-center justify-between gap-4 px-2">
              <p
                className={`scene-mono text-[0.65rem] uppercase tracking-[0.35em] ${
                  error
                    ? "text-red-300/85"
                    : length > 0 && length < SUBMIT_LIMITS.pitchMin
                      ? "text-[var(--scene-gold-bright)]"
                      : length > SUBMIT_LIMITS.pitchMax * 0.9
                        ? "text-amber-200/85"
                        : "text-white/35"
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
            </div>
          </form>
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 sm:bottom-8 sm:right-8">
          <CornerSparkle size={26} />
        </div>
      </main>
    </>
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
