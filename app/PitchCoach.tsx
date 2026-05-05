"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Sparkles, Check, X, Loader2, MessageSquareText } from "lucide-react";

const COACH_TOGGLE_KEY = "pitch-pit:coach-enhance-enabled";

// How long after the last keystroke before we ping the coach for
// follow-up questions. 5s is long enough that we don't fire mid-sentence,
// short enough that the user hasn't moved on.
const FOLLOWUPS_DEBOUNCE_MS = 5000;

// Don't ping the coach until the pitch has enough substance to react to.
// Below 80 chars there's nothing meaningful to follow up on.
const MIN_LEN_FOR_COACH = 80;

// ─── heuristic quality checks ────────────────────────────────────────
// Cheap regex-based signals that update as the user types. They're not
// authoritative — the AI judges have the final word — but they give
// the user immediate, actionable feedback while drafting.

type CheckResult = { label: string; passed: boolean; hint: string };

// Forbidden words pulled from the judge system prompts (Gstack, Vee,
// Robbins). All three explicitly downgrade pitches that lean on these,
// so flagging them during typing saves the user from a low score.
const BUZZWORDS = [
  "synergy",
  "leverage",
  "streamline",
  "innovative",
  "disrupt",
  "revolutionize",
  "paradigm",
  "ecosystem",
  "holistic",
  "seamless",
  "robust",
  "scalable",
  "frictionless",
  "cutting-edge",
  "next-gen",
  "growth-hack",
  "viral coefficient",
  "manifest",
  "vibration",
  "abundance",
];
const BUZZWORD_RE = new RegExp(
  `\\b(${BUZZWORDS.map((w) => w.replace(/-/g, "[- ]?")).join("|")})\\b`,
  "i",
);

function detectBuzzwords(text: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(BUZZWORD_RE, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(m[0].toLowerCase());
  }
  return Array.from(found);
}

function runChecks(text: string): CheckResult[] {
  const t = text.toLowerCase();
  const len = text.trim().length;
  const detectedBuzzwords = detectBuzzwords(text);
  return [
    {
      label: "Names a specific user",
      hint: "Who has the pain? Be concrete.",
      passed:
        /\b(for|target|customers?|users?|founders?|teams?|developers?|designers?|operators?|sellers?|managers?|creators?|engineers?|students?|parents?|patients?|drivers?|owners?|workers?)\b/.test(
          t,
        ),
    },
    {
      label: "Includes a number / metric",
      hint: "Concrete numbers beat vague claims.",
      passed: /\d/.test(text),
    },
    {
      label: "Has a why-now signal",
      hint: "What changed recently that makes this possible?",
      passed:
        /\b(now|today|2025|2026|recent(?:ly)?|after|since|just|current(?:ly)?|new)\b/.test(
          t,
        ),
    },
    {
      label: "Mentions distribution",
      hint: "How do the first 100 users hear about this?",
      passed:
        /\b(distribution|reach|channel|tiktok|linkedin|reddit|youtube|twitter|x\.com|content|community|seo|launch|newsletter|paid|organic|virality|word of mouth|wom|partner)\b/.test(
          t,
        ),
    },
    {
      label: "Length is in range (60–1500)",
      hint: "Tight enough to read, deep enough to judge.",
      passed: len >= 60 && len <= 1500,
    },
    {
      // The three judges all downgrade pitches that lean on buzzwords.
      // Catching them during typing saves a real point off the score.
      label: detectedBuzzwords.length
        ? `Buzzwords spotted — drop ${detectedBuzzwords.slice(0, 3).join(", ")}${
            detectedBuzzwords.length > 3 ? "…" : ""
          }`
        : "Avoids judge-flagged buzzwords",
      hint: "Concrete verbs beat 'synergy', 'leverage', 'disrupt'.",
      passed: detectedBuzzwords.length === 0,
    },
  ];
}

export function PitchCoach({
  text,
  setText,
  onPolishStart,
  onPolishEnd,
}: {
  text: string;
  setText: (t: string) => void;
  /** Called when the polish flow opens / closes. Lets the parent
   *  hide the submit button while the diff overlay is up. */
  onPolishStart?: () => void;
  onPolishEnd?: () => void;
}) {
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [followupsLoading, setFollowupsLoading] = useState(false);
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedForRef = useRef<string>("");
  const trimmed = text.trim();
  const len = trimmed.length;
  const visible = len > 5;
  const checks = runChecks(text);

  // Restore toggle state from localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COACH_TOGGLE_KEY);
      if (saved === "1") setEnhanceEnabled(true);
    } catch {
      /* private mode etc. — toggle stays default-off */
    }
  }, []);

  function persistToggle(next: boolean) {
    setEnhanceEnabled(next);
    try {
      window.localStorage.setItem(COACH_TOGGLE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // Debounced follow-up fetch. Only ping the coach after the user
  // pauses typing AND the pitch is substantial AND we haven't already
  // fetched for this exact text.
  useEffect(() => {
    if (len < MIN_LEN_FOR_COACH) {
      setFollowups([]);
      return;
    }
    if (lastFetchedForRef.current === trimmed) return;
    const id = window.setTimeout(() => {
      lastFetchedForRef.current = trimmed;
      setFollowupsLoading(true);
      fetch("/api/pitch-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch: trimmed, action: "followups" }),
      })
        .then(async (res) => {
          if (!res.ok) {
            // Auth / server error — fail quietly; followups are
            // a nice-to-have, not the main path.
            return { questions: [] };
          }
          return (await res.json()) as { questions?: string[] };
        })
        .then((data) => {
          setFollowups(data.questions ?? []);
        })
        .catch(() => {
          /* network blip — leave followups empty */
        })
        .finally(() => setFollowupsLoading(false));
    }, FOLLOWUPS_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [trimmed, len]);

  async function polish() {
    if (len < 60) return;
    setError(null);
    setEnhanceLoading(true);
    onPolishStart?.();
    try {
      const res = await fetch("/api/pitch-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch: trimmed, action: "enhance" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? "Polish failed.");
      }
      const data = (await res.json()) as { enhanced?: string };
      if (!data.enhanced) throw new Error("Coach returned an empty result.");
      setEnhanced(data.enhanced);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Polish failed.");
      onPolishEnd?.();
    } finally {
      setEnhanceLoading(false);
    }
  }

  function acceptEnhanced() {
    if (!enhanced) return;
    setText(enhanced);
    setEnhanced(null);
    onPolishEnd?.();
  }

  function rejectEnhanced() {
    setEnhanced(null);
    onPolishEnd?.();
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          // Margin owned by the parent — this component is currently
          // mounted above the input pill on the homepage, so spacing
          // belongs on the wrapper rather than on the bubble itself.
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md"
        >
          {/* Header row: title + AI-enhance toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lightbulb
                className="h-3.5 w-3.5 text-[var(--scene-gold)]"
                aria-hidden
              />
              <h3 className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/85">
                Pitch coach
              </h3>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <span className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
                AI polish
              </span>
              <Toggle on={enhanceEnabled} onChange={persistToggle} />
            </label>
          </div>

          {/* Quality progress + remaining criteria.
              UX choice: show only what's MISSING, not what's done.
              Passed checks fade out instead of staying visible —
              converts the checklist from "homework" into momentum.
              When all 5 pass, the list collapses into a single
              celebratory line. The progress dots give a sense of
              how close they are without re-reading completed items. */}
          <ProgressDots passed={checks.filter((c) => c.passed).length} total={checks.length} />
          {checks.every((c) => c.passed) ? (
            <p className="flex items-center gap-2 text-[0.78rem] text-white/90">
              <span
                aria-hidden
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--scene-gold)]/25 text-[var(--scene-gold)]"
              >
                <Check className="h-2.5 w-2.5" />
              </span>
              <span>
                <span className="text-[var(--scene-gold-bright)]">Sharp.</span>
                {" "}
                Send it.
              </span>
            </p>
          ) : (
            <ul className="grid gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {checks
                  .filter((c) => !c.passed)
                  .map((c) => (
                    <motion.li
                      key={c.label}
                      layout
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-start gap-2 text-[0.78rem] leading-snug"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-white/35"
                      />
                      <div className="min-w-0">
                        <span className="block text-white/85">{c.label}</span>
                        <span className="scene-mono mt-0.5 block text-[0.55rem] uppercase tracking-[0.16em] text-white/45">
                          {c.hint}
                        </span>
                      </div>
                    </motion.li>
                  ))}
              </AnimatePresence>
            </ul>
          )}

          {/* AI follow-ups */}
          {(followupsLoading || followups.length > 0) && (
            <div className="border-t border-white/[0.06] pt-3">
              <p className="scene-mono mb-2 flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
                <MessageSquareText className="h-3 w-3" aria-hidden />
                {followupsLoading
                  ? "Coach is thinking…"
                  : "The judges might ask"}
              </p>
              {!followupsLoading && (
                <ul className="space-y-1.5">
                  {followups.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[0.78rem] leading-snug text-white/85"
                    >
                      <span
                        aria-hidden
                        className="mt-1 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[var(--scene-gold)]/60"
                      />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* AI enhance — Polish button (only when toggle on AND length OK) */}
          {enhanceEnabled && len >= 60 && !enhanced && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
              <p className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
                AI rewrites your draft. You decide what to keep.
              </p>
              <button
                type="button"
                onClick={polish}
                disabled={enhanceLoading}
                className="scene-mono inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--scene-gold)]/15 px-4 text-[0.6rem] font-medium uppercase tracking-[0.32em] text-[var(--scene-gold)] transition-all hover:bg-[var(--scene-gold)]/25 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
              >
                {enhanceLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden />
                )}
                {enhanceLoading ? "Polishing…" : "Polish my pitch"}
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="scene-mono text-[0.6rem] uppercase tracking-[0.16em] text-red-300/85"
            >
              {error}
            </p>
          )}

          {/* Diff panel — appears when enhance returned a result */}
          <AnimatePresence>
            {enhanced && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3 rounded-xl border border-[var(--scene-gold)]/30 bg-[var(--scene-gold)]/[0.04] p-4"
              >
                <p className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-[var(--scene-gold)]">
                  ↘ Polished version
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col">
                    <p className="scene-mono mb-1.5 text-[0.55rem] uppercase tracking-[0.3em] text-white/45">
                      Yours
                    </p>
                    {/* Independently scrollable so a long pitch doesn't
                        truncate or push the diff card out of view. Capped
                        height keeps the side-by-side comparison usable. */}
                    <div className="max-h-64 overflow-y-auto pr-2">
                      <p className="whitespace-pre-wrap text-[0.78rem] leading-relaxed text-white/65">
                        {trimmed}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <p className="scene-mono mb-1.5 text-[0.55rem] uppercase tracking-[0.3em] text-[var(--scene-gold-bright)]">
                      Polished
                    </p>
                    <div className="max-h-64 overflow-y-auto pr-2">
                      <p className="whitespace-pre-wrap text-[0.78rem] leading-relaxed text-white/95">
                        {enhanced}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--scene-gold)]/20 pt-3">
                  <button
                    type="button"
                    onClick={acceptEnhanced}
                    className="scene-mono inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--scene-gold)] px-4 text-[0.6rem] font-medium uppercase tracking-[0.32em] text-black transition-all hover:bg-[var(--scene-gold)]/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Use polished
                  </button>
                  <button
                    type="button"
                    onClick={rejectEnhanced}
                    className="scene-mono inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[0.6rem] font-medium uppercase tracking-[0.32em] text-white/85 transition-all hover:border-white/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
                  >
                    <X className="h-3 w-3" aria-hidden />
                    Keep mine
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)] ${
        on ? "bg-[var(--scene-gold)]" : "bg-white/15"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
        className={`inline-block h-3.5 w-3.5 rounded-full ${on ? "ml-[1.125rem] bg-black" : "ml-[0.1875rem] bg-white/85"}`}
      />
    </button>
  );
}

function ProgressDots({ passed, total }: { passed: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={passed}
        aria-label={`Pitch quality: ${passed} of ${total} criteria met`}
      >
        {Array.from({ length: total }, (_, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={false}
            animate={{
              backgroundColor:
                i < passed
                  ? "rgba(255, 184, 0, 0.95)"
                  : "rgba(255, 255, 255, 0.12)",
              scale: i < passed ? 1 : 0.8,
            }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="block h-1.5 w-1.5 rounded-full"
          />
        ))}
      </div>
      <span className="scene-mono text-[0.55rem] uppercase tracking-[0.16em] text-white/55 tabular-nums">
        {passed}/{total} sharp
      </span>
    </div>
  );
}
