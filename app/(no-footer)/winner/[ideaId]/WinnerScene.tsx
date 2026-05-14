"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { createClient } from "@/lib/supabase/client";

export interface BuildLogEntry {
  ts: string;
  phase: BuildPhase;
  msg: string;
}

type BuildPhase =
  | "queued"
  | "generating"
  | "deploying"
  | "complete"
  | "failed";

interface QueueState {
  status: string;
  build_phase: BuildPhase | string;
  retry_count: number;
  error: string | null;
  mvp_url: string | null;
  repo_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface WinnerIdea {
  id: string;
  title: string;
  pitch: string;
  score: number | null;
  final_score: number | null;
  verdict: string | null;
  status: string;
  mvp_url: string | null;
  screenshot_url: string | null;
}

interface WinnerSceneProps {
  idea: WinnerIdea;
  initialQueue: QueueState;
  initialLogs: BuildLogEntry[];
}

// Ordered phase list — drives the progress rail. 'failed' is rendered
// inline (oxblood) rather than as a rail stop.
const PHASES: readonly BuildPhase[] = [
  "queued",
  "generating",
  "deploying",
  "complete",
] as const;

const PHASE_LABEL: Record<BuildPhase, string> = {
  queued: "Queued",
  generating: "Generating code",
  deploying: "Deploying",
  complete: "Live",
  failed: "Failed",
};

const PHASE_BLURB: Record<BuildPhase, string> = {
  queued: "GitHub Actions runner spinning up.",
  generating: "Claude Agent SDK writing the MVP.",
  deploying: "Pushing to Vercel and wiring DNS.",
  complete: "MVP shipped. To the victor go the tokens.",
  failed: "Build failed. Falling back to manual.",
};

function phaseIndex(phase: BuildPhase | string): number {
  const idx = PHASES.indexOf(phase as BuildPhase);
  return idx === -1 ? 0 : idx;
}

function formatTime(ts: string | null): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

export function WinnerScene({
  idea,
  initialQueue,
  initialLogs,
}: WinnerSceneProps) {
  const [queue, setQueue] = useState<QueueState>(initialQueue);
  const [logs, setLogs] = useState<BuildLogEntry[]>(initialLogs);
  const logTailRef = useRef<HTMLDivElement>(null);

  // Subscribe to build_queue UPDATEs for this idea. The cron route keeps
  // build_logs as the source of truth for the tail; we replace the full
  // array on each update rather than diffing — small (≤200 entries) and
  // append-only on the server.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`build-queue-${idea.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "build_queue",
          filter: `idea_id=eq.${idea.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setQueue((prev) => ({
            ...prev,
            status: (row.status as string) ?? prev.status,
            build_phase: (row.build_phase as BuildPhase) ?? prev.build_phase,
            retry_count: (row.retry_count as number) ?? prev.retry_count,
            error: (row.error as string | null) ?? prev.error,
            mvp_url: (row.mvp_url as string | null) ?? prev.mvp_url,
            repo_url: (row.repo_url as string | null) ?? prev.repo_url,
            completed_at:
              (row.completed_at as string | null) ?? prev.completed_at,
          }));
          if (Array.isArray(row.build_logs)) {
            setLogs(row.build_logs as BuildLogEntry[]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idea.id]);

  // Auto-scroll the log tail to the most recent entry on every append.
  useEffect(() => {
    const el = logTailRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const isFailed =
    queue.build_phase === "failed" || queue.status === "failed";
  const isComplete =
    queue.build_phase === "complete" || queue.status === "complete";
  const liveUrl = queue.mvp_url ?? idea.mvp_url;
  const repoUrl = queue.repo_url;

  const currentIdx = phaseIndex(queue.build_phase);
  const startedAt = formatTime(queue.started_at);
  const completedAt = formatTime(queue.completed_at);

  const visibleLogs = useMemo(() => logs.slice(-60), [logs]);

  return (
    <div className="scene min-h-screen relative" style={{ background: "var(--scene-bg)" }}>
      <MinimalistHeader />

      <main className="relative z-10 mx-auto max-w-3xl px-6 pt-32 pb-24">
        {/* Eyebrow */}
        <div
          className="text-xs uppercase tracking-[0.18em]"
          style={{
            fontFamily: "var(--font-scene-mono)",
            color: "var(--scene-gold)",
          }}
        >
          {isComplete ? "Built" : "Building now"}
        </div>

        {/* Title — Fraunces display */}
        <h1
          className="scene-display mt-3 text-4xl sm:text-5xl leading-[1.05] tracking-tight"
          style={{ color: "var(--scene-text)" }}
        >
          {idea.title}
        </h1>

        {/* Score line — mono */}
        <div
          className="mt-3 text-xs uppercase tracking-[0.16em] opacity-70"
          style={{
            fontFamily: "var(--font-scene-mono)",
            color: "var(--scene-text)",
          }}
        >
          {idea.score != null && <>ai {idea.score}/10</>}
          {idea.final_score != null && (
            <> · final {idea.final_score}/100</>
          )}
          {idea.verdict && <> · {idea.verdict}</>}
        </div>

        {/* Pitch excerpt */}
        <p
          className="mt-6 text-base sm:text-lg leading-relaxed opacity-80"
          style={{ color: "var(--scene-text)" }}
        >
          {idea.pitch}
        </p>

        {/* ─── Progress rail ──────────────────────────────────────── */}
        <section
          aria-label="Build progress"
          className="mt-12 rounded-md border p-6"
          style={{
            borderColor: "rgba(255,184,0,0.18)",
            background: "rgba(0,0,0,0.32)",
          }}
        >
          <div className="flex items-center justify-between">
            <h2
              className="text-xs uppercase tracking-[0.18em]"
              style={{
                fontFamily: "var(--font-scene-mono)",
                color: "var(--scene-gold)",
              }}
            >
              Status
            </h2>
            <div
              className="text-[11px] uppercase tracking-[0.14em] opacity-60"
              style={{
                fontFamily: "var(--font-scene-mono)",
                color: "var(--scene-text)",
              }}
            >
              {startedAt && !isComplete && <>started {startedAt}</>}
              {completedAt && isComplete && <>shipped {completedAt}</>}
              {queue.retry_count > 0 && !isFailed && (
                <> · retry {queue.retry_count}/1</>
              )}
            </div>
          </div>

          {/* Phase pills */}
          <ol className="mt-5 flex gap-3 flex-wrap">
            {PHASES.map((p, i) => {
              const reached = i <= currentIdx && !isFailed;
              const active = i === currentIdx && !isFailed && !isComplete;
              return (
                <li
                  key={p}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    fontFamily: "var(--font-scene-mono)",
                    color: reached
                      ? "var(--scene-gold)"
                      : "rgba(244,237,224,0.4)",
                    letterSpacing: "0.08em",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: reached
                        ? "var(--scene-gold)"
                        : "rgba(244,237,224,0.25)",
                      boxShadow: active
                        ? "0 0 0 4px rgba(255,184,0,0.15)"
                        : "none",
                      transition: "background 200ms, box-shadow 200ms",
                    }}
                  />
                  {PHASE_LABEL[p].toUpperCase()}
                </li>
              );
            })}
          </ol>

          {/* Phase blurb */}
          <p
            className="mt-5 text-sm leading-relaxed"
            style={{
              color: isFailed ? "var(--scene-oxblood)" : "var(--scene-text)",
              opacity: isFailed ? 1 : 0.85,
            }}
          >
            {isFailed
              ? queue.retry_count > 0
                ? "Two builds failed in a row. A manual fallback email was sent — a human will take it from here."
                : "Build failed. Retrying once automatically."
              : PHASE_BLURB[
                  (queue.build_phase as BuildPhase) ?? "queued"
                ] ?? ""}
          </p>

          {/* Live link when complete */}
          {isComplete && liveUrl && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-sm px-5 py-3 text-sm transition"
                style={{
                  fontFamily: "var(--font-scene-mono)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: "var(--scene-gold)",
                  color: "#0a0a0a",
                }}
              >
                Open MVP →
              </Link>
              {repoUrl && (
                <Link
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline opacity-70 hover:opacity-100"
                  style={{
                    fontFamily: "var(--font-scene-mono)",
                    color: "var(--scene-text)",
                  }}
                >
                  View source ↗
                </Link>
              )}
            </div>
          )}

          {/* Error block on terminal failure */}
          {isFailed && queue.error && (
            <pre
              className="mt-5 max-h-32 overflow-auto rounded-sm border p-3 text-[11px] leading-relaxed"
              style={{
                fontFamily: "var(--font-scene-mono)",
                borderColor: "rgba(140,30,30,0.4)",
                background: "rgba(20,5,5,0.6)",
                color: "var(--scene-oxblood)",
              }}
            >
              {queue.error}
            </pre>
          )}
        </section>

        {/* ─── Log tail ───────────────────────────────────────────── */}
        <section
          aria-label="Build log"
          className="mt-8 rounded-md border"
          style={{
            borderColor: "rgba(255,184,0,0.12)",
            background: "rgba(0,0,0,0.42)",
          }}
        >
          <header
            className="flex items-center justify-between border-b px-4 py-2"
            style={{ borderColor: "rgba(255,184,0,0.12)" }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{
                fontFamily: "var(--font-scene-mono)",
                color: "var(--scene-gold)",
              }}
            >
              Build feed
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.14em] opacity-50"
              style={{
                fontFamily: "var(--font-scene-mono)",
                color: "var(--scene-text)",
              }}
            >
              {logs.length} {logs.length === 1 ? "line" : "lines"}
            </span>
          </header>
          <div
            ref={logTailRef}
            className="max-h-72 overflow-auto px-4 py-3 text-[12px] leading-relaxed"
            style={{
              fontFamily: "var(--font-scene-mono)",
              color: "var(--scene-text)",
            }}
          >
            {visibleLogs.length === 0 ? (
              <span className="opacity-40">Waiting for the runner…</span>
            ) : (
              visibleLogs.map((entry, i) => (
                <div key={i} className="flex gap-3">
                  <span className="opacity-40 shrink-0">
                    {formatTime(entry.ts) ?? "--:--"}
                  </span>
                  <span
                    className="shrink-0 opacity-60"
                    style={{
                      color:
                        entry.phase === "failed"
                          ? "var(--scene-oxblood)"
                          : entry.phase === "complete"
                            ? "var(--scene-verdigris)"
                            : "var(--scene-gold)",
                    }}
                  >
                    [{entry.phase}]
                  </span>
                  <span className="opacity-90 break-all">{entry.msg}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Footer links */}
        <nav
          className="mt-10 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] opacity-60"
          style={{
            fontFamily: "var(--font-scene-mono)",
            color: "var(--scene-text)",
          }}
        >
          <Link href={`/idea/${idea.id}`} className="hover:opacity-100">
            ← Idea page
          </Link>
          <Link href="/built" className="hover:opacity-100">
            Gallery →
          </Link>
        </nav>
      </main>
    </div>
  );
}
