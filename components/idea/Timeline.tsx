import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  label: string;
  rank: number;
};

const STAGES: readonly Stage[] = [
  { id: "submitted", label: "Submitted", rank: 1 },
  { id: "scored", label: "Scored", rank: 2 },
  { id: "queued", label: "Greenlit", rank: 3 },
  { id: "building", label: "Building", rank: 4 },
  { id: "built", label: "Live", rank: 5 },
] as const;

const TERMINAL = new Set(["rejected", "failed"]);

function rankFor(status: string): number {
  switch (status) {
    case "submitted":
      return 1;
    case "scored":
      return 2;
    case "queued":
      return 3;
    case "building":
      return 4;
    case "built":
      return 5;
    default:
      return 0;
  }
}

export function Timeline({
  status,
  buildRecommended,
}: {
  status: string;
  buildRecommended: boolean;
}) {
  const isTerminal = TERMINAL.has(status);
  const currentRank = rankFor(status);
  const stages =
    !buildRecommended && status === "scored" ? STAGES.slice(0, 2) : STAGES;

  return (
    <section
      aria-label="Build status timeline"
      className="scene-card mx-auto max-w-3xl px-6 py-7 sm:px-9"
    >
      <p className="scene-mono mb-6 text-center text-[0.6rem] uppercase tracking-[0.35em] text-white/40">
        Path
      </p>

      <ol className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr sm:gap-4">
        {stages.map((stage, i) => {
          const reached = currentRank >= stage.rank && !isTerminal;
          const active = currentRank === stage.rank && !isTerminal;
          return (
            <li key={stage.id} className="relative">
              <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
                <span
                  className={cn(
                    "scene-mono relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.6rem] font-medium transition-colors",
                    reached
                      ? "border-[var(--scene-gold)] bg-[var(--scene-gold)]/8 text-[var(--scene-gold-bright)]"
                      : "border-white/15 text-white/30",
                    active &&
                      "shadow-[0_0_18px_rgba(255,184,0,0.6),inset_0_0_8px_rgba(255,184,0,0.3)]",
                  )}
                >
                  {reached ? "·" : i + 1}
                </span>
                <p
                  className={cn(
                    "scene-mono text-[0.6rem] uppercase tracking-[0.3em] transition-colors",
                    reached ? "text-white/85" : "text-white/35",
                    active && "text-[var(--scene-gold-bright)]",
                  )}
                >
                  {stage.label}
                </p>
              </div>
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[calc(50%+1rem)] top-3.5 hidden h-px w-[calc(100%-2rem)] sm:block"
                  style={{
                    background:
                      currentRank > stage.rank && !isTerminal
                        ? "linear-gradient(90deg, var(--scene-gold), var(--scene-gold))"
                        : "rgba(255,255,255,0.12)",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      {isTerminal && (
        <p className="scene-mono mt-6 text-center text-[0.6rem] uppercase tracking-[0.35em] text-red-300/80">
          {status === "rejected"
            ? "Pitch withheld"
            : "Build did not survive"}
        </p>
      )}
    </section>
  );
}
