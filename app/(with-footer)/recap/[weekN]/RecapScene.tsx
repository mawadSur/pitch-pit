"use client";

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { EmailCapture } from "@/components/idea/EmailCapture";
import { titleToSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────
export type RecapContender = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  rank: number;
  finalScore: number;
  aiScore: number;
  voteCount: number;
  verdict: string | null;
  status: string;
};

export type RecapWinner = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  aiScore: number | null;
  voteCount: number | null;
  verdict: string | null;
  strengths: string[];
  concerns: string[];
  status: string;
  mvpUrl: string | null;
  screenshotUrl: string | null;
  // Snapshot final_score from the frozen week_results row. Fallback to
  // aiScore × 10 when null (legacy weeks before 025 landed).
  finalScore: number | null;
};

export type RecapBuild = {
  status: string;
  buildPhase: string | null;
  mvpUrl: string | null;
  repoUrl: string | null;
  screenshotUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type RecapWeek = {
  weekNumber: number;
  startAt: string;
  endAt: string;
  status: "open" | "closed" | "built";
};

// ─── Helpers ───────────────────────────────────────────────────────────
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
function formatRange(start: string, end: string): string {
  try {
    return `${DATE_FMT.format(new Date(start))} → ${DATE_FMT.format(new Date(end))}`;
  } catch {
    return "";
  }
}

function ideaHref(id: string, title: string): string {
  const slug = titleToSlug(title);
  return slug ? `/idea/${id}/${slug}` : `/idea/${id}`;
}

// ─── RecapScene ────────────────────────────────────────────────────────
export function RecapScene({
  week,
  winner,
  contenders,
  build,
}: {
  week: RecapWeek;
  winner: RecapWinner | null;
  contenders: RecapContender[];
  build: RecapBuild | null;
}) {
  // The build can be in several terminal/non-terminal states. The recap
  // UI surfaces three meaningful buckets:
  //   complete → "The Build" shows the MVP frame + open-link CTA
  //   in-progress → status pill (queued / generating / deploying)
  //   failed / null → "shipped manually" pointer to /built
  const buildBucket: "complete" | "in_progress" | "missing" = (() => {
    if (!build) return "missing";
    if (build.status === "complete" || build.buildPhase === "complete") {
      return "complete";
    }
    if (
      build.status === "failed" ||
      build.buildPhase === "failed" ||
      build.status === "rejected"
    ) {
      return "missing";
    }
    return "in_progress";
  })();

  const winnerFinal =
    winner?.finalScore ??
    (winner?.aiScore != null ? winner.aiScore * 10 : null);

  return (
    <MotionConfig reducedMotion="user">
      <>
        <MinimalistHeader />
        <main
          id="main"
          tabIndex={-1}
          className="scene relative isolate min-h-dvh overflow-hidden bg-black"
        >
          <div aria-hidden className="scene-bg-gradient absolute inset-0" />
          <div aria-hidden className="scene-beam-narrow" />
          <Particles />
          <div aria-hidden className="scene-grain" />

          <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
            <HeroSection week={week} winner={winner} finalScore={winnerFinal} />

            {contenders.length > 0 && (
              <ContendersSection contenders={contenders} />
            )}

            {winner && (
              <VerdictSection winner={winner} finalScore={winnerFinal} />
            )}

            <BuildSection
              winner={winner}
              build={build}
              bucket={buildBucket}
            />

            {/* Weekly-winner email capture — recap pages are a natural place
                to convert a reader into a subscriber: they just watched a
                week play out, so "get next week's winner by email" lands. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6 }}
              className="mt-24 border-t border-white/[0.08] pt-10"
            >
              <EmailCapture
                source="recap"
                headline="get next week's winner by email"
                className="max-w-md"
              />
            </motion.div>

            <FooterNav weekNumber={week.weekNumber} winner={winner} />
          </div>
        </main>
      </>
    </MotionConfig>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────

function HeroSection({
  week,
  winner,
  finalScore,
}: {
  week: RecapWeek;
  winner: RecapWinner | null;
  finalScore: number | null;
}) {
  const range = formatRange(week.startAt, week.endAt);
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <p className="scene-mono text-[0.65rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.78rem]">
        · the week in review ·
      </p>
      <h1 className="scene-display mt-5 flex items-baseline justify-center gap-4 text-balance leading-[1.02] text-white">
        <span className="scene-numeral text-7xl text-[var(--scene-gold)] sm:text-8xl">
          Week {week.weekNumber}
        </span>
      </h1>
      {range && (
        <p className="scene-mono mt-4 text-[0.6rem] uppercase tracking-[0.32em] text-white/55 sm:text-[0.72rem]">
          {range}
        </p>
      )}
      {winner && (
        <>
          <p className="scene-display-italic mx-auto mt-10 max-w-3xl text-balance text-2xl leading-snug text-white sm:text-3xl lg:text-4xl">
            &ldquo;{winner.verdict ?? winner.title}&rdquo;
          </p>
          <div className="mt-8 flex flex-wrap items-baseline justify-center gap-4">
            <span className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/45">
              the verdict
            </span>
            <span className="flex items-baseline gap-1">
              <span className="scene-numeral text-5xl tabular-nums text-[var(--scene-gold-bright)] sm:text-6xl">
                {finalScore ?? "—"}
              </span>
              <span className="scene-mono text-[0.6rem] uppercase tracking-[0.16em] text-white/45">
                /100
              </span>
            </span>
          </div>
        </>
      )}
    </motion.header>
  );
}

function ContendersSection({ contenders }: { contenders: RecapContender[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6 }}
      className="mt-24"
    >
      <SectionLabel>The Contenders</SectionLabel>
      <ol className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {contenders.map((c) => (
          <li key={c.id}>
            <ContenderRow c={c} />
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

function ContenderRow({ c }: { c: RecapContender }) {
  // Rank-1 gets the gold treatment; everyone else is a quieter row.
  const isTop = c.rank === 1;
  const isBuilt = c.status === "built";
  return (
    <Link
      href={ideaHref(c.id, c.title)}
      className={cn(
        "group flex items-center gap-5 py-5 transition-colors",
        "hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60",
      )}
    >
      <span
        className={cn(
          "scene-numeral w-14 shrink-0 text-right text-3xl tabular-nums sm:w-16 sm:text-4xl",
          isTop
            ? "text-[var(--scene-gold-bright)]"
            : "text-white/55",
        )}
      >
        {String(c.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "scene-display truncate text-lg font-medium sm:text-xl",
            isTop ? "text-white" : "text-white/85",
          )}
        >
          {c.title}
        </h3>
        <p className="scene-mono mt-1 truncate text-[0.55rem] uppercase tracking-[0.28em] text-white/40">
          {c.handle ? `${c.handle} · ` : ""}AI {c.aiScore}/10 · {c.voteCount}{" "}
          {c.voteCount === 1 ? "vote" : "votes"}
          {isBuilt && (
            <> · <span className="text-[var(--scene-verdigris-bright)]">BUILT</span></>
          )}
        </p>
      </div>
      <span className="flex shrink-0 items-baseline gap-1">
        <span
          className={cn(
            "scene-numeral text-2xl tabular-nums sm:text-3xl",
            isTop
              ? "text-[var(--scene-gold-bright)]"
              : "text-white/80",
          )}
        >
          {c.finalScore}
        </span>
        <span className="scene-mono text-[0.55rem] uppercase tracking-[0.16em] text-white/35">
          /100
        </span>
      </span>
    </Link>
  );
}

function VerdictSection({
  winner,
  finalScore,
}: {
  winner: RecapWinner;
  finalScore: number | null;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6 }}
      className="mt-24"
    >
      <SectionLabel>The Verdict</SectionLabel>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div>
          <h2 className="scene-display text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl">
            <Link
              href={ideaHref(winner.id, winner.title)}
              className="rounded-sm transition-colors hover:text-[var(--scene-gold-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
            >
              {winner.title}
            </Link>
          </h2>
          {winner.handle && (
            <p className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.32em] text-white/45">
              {winner.handle}
            </p>
          )}
          {winner.verdict && (
            <p className="scene-display-italic mt-6 border-l-2 border-[var(--scene-gold)]/55 pl-5 text-xl leading-snug text-white sm:text-2xl">
              &ldquo;{winner.verdict}&rdquo;
            </p>
          )}
          <p className="scene-display mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
            {winner.pitch}
          </p>
        </div>

        <aside className="rounded-md border border-[var(--scene-gold)]/20 bg-black/40 p-6 sm:p-7">
          <div className="flex items-baseline gap-3">
            <span className="scene-numeral text-5xl tabular-nums text-[var(--scene-gold-bright)]">
              {finalScore ?? "—"}
            </span>
            <span className="scene-mono text-[0.55rem] uppercase tracking-[0.18em] text-white/50">
              /100 · final
            </span>
          </div>
          <div className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.18em] text-white/45">
            AI {winner.aiScore ?? "—"}/10 · {winner.voteCount ?? 0}{" "}
            {(winner.voteCount ?? 0) === 1 ? "vote" : "votes"}
          </div>

          {winner.strengths.length > 0 && (
            <div className="mt-6">
              <h3 className="scene-mono text-[0.55rem] uppercase tracking-[0.28em] text-[var(--scene-gold)]">
                Strengths
              </h3>
              <ul className="scene-display mt-3 space-y-2 text-sm text-white/80 sm:text-base">
                {winner.strengths.slice(0, 4).map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="text-[var(--scene-gold)]">
                      →
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {winner.concerns.length > 0 && (
            <div className="mt-6">
              <h3 className="scene-mono text-[0.55rem] uppercase tracking-[0.28em] text-[var(--scene-oxblood-bright)]">
                Concerns
              </h3>
              <ul className="scene-display mt-3 space-y-2 text-sm text-white/75 sm:text-base">
                {winner.concerns.slice(0, 4).map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className="text-[var(--scene-oxblood-bright)]"
                    >
                      →
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </motion.section>
  );
}

function BuildSection({
  winner,
  build,
  bucket,
}: {
  winner: RecapWinner | null;
  build: RecapBuild | null;
  bucket: "complete" | "in_progress" | "missing";
}) {
  if (!winner) return null;

  if (bucket === "complete" && build?.mvpUrl) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.6 }}
        className="mt-24"
      >
        <SectionLabel tone="verdigris">The Build</SectionLabel>
        <div className="mt-8 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <MvpFrame
            url={build.mvpUrl}
            screenshotUrl={build.screenshotUrl}
            title={winner.title}
          />
          <div>
            <p className="scene-display-italic text-2xl leading-snug text-white sm:text-3xl">
              Shipped.
            </p>
            <p className="scene-display mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
              The winning pitch was built into a live MVP and handed to the
              founder &mdash; no equity, no fees.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href={build.mvpUrl}
                target="_blank"
                rel="noreferrer"
                className="scene-display inline-flex h-11 items-center gap-2 rounded-full bg-[var(--scene-verdigris-bright)]/15 px-5 text-sm font-medium text-[var(--scene-verdigris-bright)] transition-all hover:bg-[var(--scene-verdigris-bright)]/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-verdigris-bright)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
              >
                Open MVP <span aria-hidden>↗</span>
              </a>
              {build.repoUrl && (
                <a
                  href={build.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="scene-mono inline-flex min-h-11 items-center rounded-full px-4 py-2 text-[0.55rem] uppercase tracking-[0.32em] text-white/55 transition-colors hover:text-white"
                >
                  View source ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  if (bucket === "in_progress") {
    const phaseLabel =
      build?.buildPhase === "generating"
        ? "Generating code"
        : build?.buildPhase === "deploying"
          ? "Deploying"
          : "Queued";
    return (
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.6 }}
        className="mt-24"
      >
        <SectionLabel>The Build</SectionLabel>
        <div className="mt-8 rounded-md border border-[var(--scene-gold)]/25 bg-black/40 p-7 sm:p-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-[var(--scene-gold)] motion-safe:animate-pulse"
            />
            <p className="scene-mono text-[0.65rem] uppercase tracking-[0.28em] text-[var(--scene-gold)]">
              {phaseLabel}
            </p>
          </div>
          <p className="scene-display mt-4 text-base leading-relaxed text-white/75 sm:text-lg">
            The build is in motion. Watch it ship in real time on the winner
            page.
          </p>
          <Link
            href={`/winner/${winner.id}`}
            className="cta-btn-primary mt-6 inline-flex text-sm"
          >
            Watch the build <span aria-hidden>→</span>
          </Link>
        </div>
      </motion.section>
    );
  }

  // Missing: failed build or no queue row at all → pointer to /built.
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6 }}
      className="mt-24"
    >
      <SectionLabel>The Build</SectionLabel>
      <div className="mt-8 rounded-md border border-white/[0.08] bg-black/40 p-7 sm:p-8">
        <p className="scene-display text-base leading-relaxed text-white/75 sm:text-lg">
          The automated builder didn&rsquo;t ship this one &mdash; the team
          picked it up by hand. Past winners live in the Hall of Fame.
        </p>
        <Link
          href="/built"
          className="cta-btn-ghost mt-6 inline-flex text-sm"
        >
          See the Hall of Fame <span aria-hidden>→</span>
        </Link>
      </div>
    </motion.section>
  );
}

function FooterNav({
  weekNumber,
  winner,
}: {
  weekNumber: number;
  winner: RecapWinner | null;
}) {
  return (
    <nav className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-10">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/leaderboard?week=${weekNumber}`}
          className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/55 transition-colors hover:text-white"
        >
          ← Week {weekNumber} leaderboard
        </Link>
        <Link
          href="/built"
          className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/55 transition-colors hover:text-white"
        >
          Hall of Fame →
        </Link>
      </div>
      {winner && winner.verdict && (
        <ShareMenu
          idea={{
            id: winner.id,
            title: winner.title,
            verdict: winner.verdict,
            finalScore:
              winner.finalScore ??
              (winner.aiScore != null ? winner.aiScore * 10 : 0),
            aiScore: winner.aiScore ?? undefined,
            voteCount: winner.voteCount ?? undefined,
            strengths: winner.strengths,
            concerns: winner.concerns,
          }}
          variant="primary"
          ariaLabel={`Share Week ${weekNumber} recap`}
        />
      )}
    </nav>
  );
}

// ─── Misc bits ─────────────────────────────────────────────────────────

function SectionLabel({
  children,
  tone = "gold",
}: {
  children: React.ReactNode;
  tone?: "gold" | "verdigris";
}) {
  const color =
    tone === "verdigris"
      ? "text-[var(--scene-verdigris-bright)]"
      : "text-[var(--scene-gold)]";
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn("h-px w-10 bg-current opacity-60", color)}
      />
      <h2
        className={cn(
          "scene-mono text-[0.65rem] uppercase tracking-[0.42em]",
          color,
        )}
      >
        {children}
      </h2>
    </div>
  );
}

function MvpFrame({
  url,
  screenshotUrl,
  title,
}: {
  url: string;
  screenshotUrl: string | null;
  title: string;
}) {
  function hostname(u: string) {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${title}`}
      className="group relative block overflow-hidden rounded-2xl border border-[var(--scene-verdigris-bright)]/35 bg-white/[0.03] shadow-[0_0_36px_-12px_rgba(91,138,110,0.45)] transition-shadow hover:shadow-[0_0_48px_-8px_rgba(91,138,110,0.6)]"
      style={{ aspectRatio: "16 / 10" }}
    >
      {screenshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl}
          alt={`Screenshot of ${title}`}
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(255,184,0,0.18)_0%,rgba(0,0,0,0.92)_72%)]">
          <div className="text-center">
            <p className="scene-mono text-[0.55rem] uppercase tracking-[0.4em] text-white/55">
              Live build
            </p>
            <p className="mt-2 text-2xl font-medium text-white sm:text-3xl">
              {hostname(url)}
            </p>
          </div>
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
      />
      <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-verdigris-bright)] motion-safe:animate-pulse" />
          <span className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-[var(--scene-verdigris-bright)]">
            Live · {hostname(url)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <span className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white">
              Enter
            </span>
          </span>
          <span
            aria-hidden
            className="text-2xl text-[var(--scene-verdigris-bright)] transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </div>
      </div>
    </a>
  );
}
