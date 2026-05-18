import Link from "next/link";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createAdminClient } from "@/lib/supabase/admin";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import "@/app/scene.css";

// /admin/metrics — week-over-week product metrics.
//
// Inherits the same HTTP Basic Auth as /admin via middleware.ts (matcher
// covers /admin and /admin/:path*). Server component, force-dynamic, no
// caching — every load is a fresh read. One round-trip per metric so we
// don't N+1 the dashboard, then we stitch the rollups in JS.
//
// v1 scope (intentionally bare):
//   - Global totals header (subscribers active, ideas, votes, users)
//   - Most recent 8 weeks, each row:
//       week_number · status · submissions · voters · votes · winner · build
//   - WoW deltas as ▲ / ▼ chips on submissions + voters + votes
// No charts, no filters, no CSV. v2 has that.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

const VISIBLE_IDEA_STATUSES = [
  "scored",
  "queued",
  "building",
  "built",
  "fallen",
] as const;

type WeekRow = {
  id: string;
  week_number: number;
  status: "open" | "closed" | "built" | string;
  start_at: string;
  end_at: string;
  winner_idea_id: string | null;
};

type IdeaLite = {
  id: string;
  week_id: string | null;
  title: string;
  final_score: number | null;
  status: string;
};

type VoteLite = {
  user_id: string;
  idea_id: string;
};

type BuildQueueLite = {
  idea_id: string;
  status: string;
};

type WeekMetric = {
  id: string;
  weekNumber: number;
  status: string;
  submissions: number;
  voters: number;
  votes: number;
  winnerTitle: string | null;
  winnerScore: number | null;
  buildStatus: string | null;
};

type Globals = {
  subscribersActive: number;
  ideasTotal: number;
  votesTotal: number;
  usersTotal: number;
  configured: boolean;
  error?: string;
};

async function fetchGlobals(): Promise<Globals> {
  try {
    const supabase = createAdminClient();

    const [subs, ideas, votes, users] = await Promise.all([
      supabase
        .from("subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("ideas").select("id", { count: "exact", head: true }),
      supabase.from("votes").select("id", { count: "exact", head: true }),
      supabase.from("users").select("id", { count: "exact", head: true }),
    ]);

    return {
      subscribersActive: subs.count ?? 0,
      ideasTotal: ideas.count ?? 0,
      votesTotal: votes.count ?? 0,
      usersTotal: users.count ?? 0,
      configured: true,
    };
  } catch (e) {
    return {
      subscribersActive: 0,
      ideasTotal: 0,
      votesTotal: 0,
      usersTotal: 0,
      configured: false,
      error: e instanceof Error ? e.message : "Supabase unavailable",
    };
  }
}

async function fetchWeekMetrics(): Promise<{
  rows: WeekMetric[];
  configured: boolean;
  error?: string;
}> {
  try {
    const supabase = createAdminClient();

    // 1. Most recent 8 weeks.
    const { data: weeks, error: weeksErr } = await supabase
      .from("weeks")
      .select("id, week_number, status, start_at, end_at, winner_idea_id")
      .order("week_number", { ascending: false })
      .limit(8);
    if (weeksErr) throw weeksErr;

    const weekRows = (weeks ?? []) as WeekRow[];
    if (weekRows.length === 0) {
      return { rows: [], configured: true };
    }

    const weekIds = weekRows.map((w) => w.id);
    const winnerIds = weekRows
      .map((w) => w.winner_idea_id)
      .filter((x): x is string => Boolean(x));

    // 2. All visible ideas in those weeks (for submission + vote rollups).
    const { data: ideas, error: ideasErr } = await supabase
      .from("ideas")
      .select("id, week_id, title, final_score, status")
      .in("week_id", weekIds)
      .in("status", [...VISIBLE_IDEA_STATUSES]);
    if (ideasErr) throw ideasErr;
    const ideaRows = (ideas ?? []) as IdeaLite[];

    // 3. All votes touching those ideas. Paged read in case > 1000.
    let votes: VoteLite[] = [];
    if (ideaRows.length > 0) {
      const ideaIds = ideaRows.map((i) => i.id);
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("votes")
          .select("user_id, idea_id")
          .in("idea_id", ideaIds)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as VoteLite[];
        votes = votes.concat(batch);
        if (batch.length < PAGE) break;
      }
    }

    // 4. Winner titles + build status for each closed week.
    const winnerById = new Map<string, IdeaLite>();
    if (winnerIds.length > 0) {
      const { data: winners, error: winnersErr } = await supabase
        .from("ideas")
        .select("id, week_id, title, final_score, status")
        .in("id", winnerIds);
      if (winnersErr) throw winnersErr;
      for (const w of (winners ?? []) as IdeaLite[]) {
        winnerById.set(w.id, w);
      }
    }

    let buildByIdea = new Map<string, string>();
    if (winnerIds.length > 0) {
      const { data: bq, error: bqErr } = await supabase
        .from("build_queue")
        .select("idea_id, status")
        .in("idea_id", winnerIds);
      if (bqErr) throw bqErr;
      buildByIdea = new Map(
        ((bq ?? []) as BuildQueueLite[]).map((r) => [r.idea_id, r.status]),
      );
    }

    // 5. Rollup per week.
    const ideaIdToWeekId = new Map<string, string>();
    const submissionsByWeek = new Map<string, number>();
    for (const idea of ideaRows) {
      if (!idea.week_id) continue;
      ideaIdToWeekId.set(idea.id, idea.week_id);
      submissionsByWeek.set(
        idea.week_id,
        (submissionsByWeek.get(idea.week_id) ?? 0) + 1,
      );
    }

    const votersByWeek = new Map<string, Set<string>>();
    const votesByWeek = new Map<string, number>();
    for (const v of votes) {
      const wid = ideaIdToWeekId.get(v.idea_id);
      if (!wid) continue;
      votesByWeek.set(wid, (votesByWeek.get(wid) ?? 0) + 1);
      let set = votersByWeek.get(wid);
      if (!set) {
        set = new Set();
        votersByWeek.set(wid, set);
      }
      set.add(v.user_id);
    }

    const rows: WeekMetric[] = weekRows.map((w) => {
      const winner = w.winner_idea_id ? winnerById.get(w.winner_idea_id) : null;
      return {
        id: w.id,
        weekNumber: w.week_number,
        status: w.status,
        submissions: submissionsByWeek.get(w.id) ?? 0,
        voters: votersByWeek.get(w.id)?.size ?? 0,
        votes: votesByWeek.get(w.id) ?? 0,
        winnerTitle: winner?.title ?? null,
        winnerScore: winner?.final_score ?? null,
        buildStatus: w.winner_idea_id
          ? (buildByIdea.get(w.winner_idea_id) ?? null)
          : null,
      };
    });

    return { rows, configured: true };
  } catch (e) {
    return {
      rows: [],
      configured: false,
      error: e instanceof Error ? e.message : "Supabase unavailable",
    };
  }
}

function delta(current: number, prior: number | undefined): string {
  if (prior === undefined) return "—";
  const d = current - prior;
  if (d === 0) return "·";
  if (d > 0) return `▲ ${d}`;
  return `▼ ${Math.abs(d)}`;
}

function deltaTone(current: number, prior: number | undefined): string {
  if (prior === undefined) return "text-white/35";
  const d = current - prior;
  if (d === 0) return "text-white/35";
  return d > 0
    ? "text-[var(--scene-verdigris-bright)]"
    : "text-[var(--scene-oxblood-bright)]";
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function MetricsPage() {
  const [globals, weekly] = await Promise.all([
    fetchGlobals(),
    fetchWeekMetrics(),
  ]);

  // Rows come back newest-first; iterate in that order but use the next
  // index (older week) as the prior comparison so the ▲/▼ reads naturally.
  const rows = weekly.rows;

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
    >
      <MinimalistHeader />
      <main
        id="main"
        tabIndex={-1}
        className="scene relative isolate min-h-dvh overflow-hidden"
      >
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-8 lg:py-16">
          <header className="mb-10 flex items-baseline justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div>
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
                Operator console · metrics
              </p>
              <h1 className="scene-display mt-2 text-3xl font-medium text-white sm:text-4xl">
                Week over week
              </h1>
            </div>
            <Link
              href="/admin"
              className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45 transition-colors hover:text-white"
            >
              ← back to admin
            </Link>
          </header>

          {(!globals.configured || !weekly.configured) && (
            <div className="mb-8 rounded-md border border-red-400/40 bg-red-500/10 px-4 py-3 scene-mono text-xs uppercase tracking-[0.25em] text-red-300">
              Supabase offline ·{" "}
              {globals.error ?? weekly.error ?? "credentials missing"}
            </div>
          )}

          {/* ───── Global totals ───── */}
          <section
            aria-labelledby="globals-heading"
            className="mb-12"
          >
            <h2
              id="globals-heading"
              className="scene-mono mb-4 text-[0.6rem] uppercase tracking-[0.35em] text-white/45"
            >
              All time
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Subscribers"
                hint="active"
                value={globals.subscribersActive}
              />
              <StatTile
                label="Ideas"
                hint="all submissions"
                value={globals.ideasTotal}
              />
              <StatTile
                label="Votes"
                hint="cumulative"
                value={globals.votesTotal}
              />
              <StatTile
                label="Users"
                hint="accounts"
                value={globals.usersTotal}
              />
            </div>
          </section>

          {/* ───── Weekly rollup ───── */}
          <section aria-labelledby="weekly-heading">
            <h2
              id="weekly-heading"
              className="scene-mono mb-4 text-[0.6rem] uppercase tracking-[0.35em] text-white/45"
            >
              Most recent 8 weeks
            </h2>

            {rows.length === 0 ? (
              <p className="scene-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/35">
                No weeks yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-white/[0.08]">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="scene-mono border-b border-white/[0.08] text-left text-[0.55rem] uppercase tracking-[0.32em] text-white/45">
                      <Th className="w-20">Week</Th>
                      <Th className="w-24">Status</Th>
                      <Th>Submissions</Th>
                      <Th>Voters</Th>
                      <Th>Votes</Th>
                      <Th>Winner</Th>
                      <Th className="w-24">Build</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const prior = rows[idx + 1];
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-white/[0.05] last:border-b-0"
                        >
                          <Td>
                            <span className="scene-numeral text-xl text-white tabular-nums">
                              {row.weekNumber}
                            </span>
                          </Td>
                          <Td>
                            <StatusPill status={row.status} />
                          </Td>
                          <Td>
                            <MetricCell
                              value={row.submissions}
                              prior={prior?.submissions}
                            />
                          </Td>
                          <Td>
                            <MetricCell
                              value={row.voters}
                              prior={prior?.voters}
                            />
                          </Td>
                          <Td>
                            <MetricCell
                              value={row.votes}
                              prior={prior?.votes}
                            />
                          </Td>
                          <Td>
                            {row.winnerTitle ? (
                              <div className="flex items-baseline gap-2">
                                <span className="line-clamp-1 max-w-[18rem] text-sm text-white">
                                  {row.winnerTitle}
                                </span>
                                {row.winnerScore !== null && (
                                  <span className="scene-numeral text-xs text-[var(--scene-gold-bright)] tabular-nums">
                                    {row.winnerScore}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/30">
                                —
                              </span>
                            )}
                          </Td>
                          <Td>
                            {row.buildStatus ? (
                              <BuildPill status={row.buildStatus} />
                            ) : (
                              <span className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/30">
                                —
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="scene-mono mt-6 text-[0.55rem] uppercase tracking-[0.3em] text-white/30">
              Deltas compare to the prior week. Submissions counts visible
              ideas only (scored / queued / building / built / fallen).
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

// ───────────────────────── presentational atoms ─────────────────────────

function StatTile({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.015] px-4 py-4">
      <p className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/45">
        {label}
      </p>
      <p className="scene-numeral mt-2 text-3xl text-white tabular-nums sm:text-4xl">
        {fmtNum(value)}
      </p>
      <p className="scene-mono mt-1 text-[0.5rem] uppercase tracking-[0.3em] text-white/30">
        {hint}
      </p>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 font-normal ${className}`}>{children}</th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}

function MetricCell({
  value,
  prior,
}: {
  value: number;
  prior: number | undefined;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="scene-numeral text-lg text-white tabular-nums">
        {fmtNum(value)}
      </span>
      <span
        className={`scene-mono text-[0.55rem] uppercase tracking-[0.28em] ${deltaTone(value, prior)}`}
      >
        {delta(value, prior)}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isOpen = status === "open";
  const isClosed = status === "closed";
  const cls = isOpen
    ? "border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]"
    : isClosed
      ? "border-white/15 bg-white/[0.03] text-white/55"
      : "border-[var(--scene-verdigris-bright)]/40 bg-[var(--scene-verdigris)]/10 text-[var(--scene-verdigris-bright)]";
  return (
    <span
      className={`scene-mono inline-flex items-center rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.3em] ${cls}`}
    >
      {status}
    </span>
  );
}

function BuildPill({ status }: { status: string }) {
  // build_queue.status: pending / approved / rejected / in_progress /
  // complete / failed. Map to gold (in-progress) / verdigris (complete) /
  // oxblood (failed/rejected) / neutral otherwise.
  let tone =
    "border-white/15 bg-white/[0.03] text-white/55";
  if (status === "complete") {
    tone =
      "border-[var(--scene-verdigris-bright)]/40 bg-[var(--scene-verdigris)]/10 text-[var(--scene-verdigris-bright)]";
  } else if (status === "in_progress" || status === "approved") {
    tone =
      "border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]";
  } else if (status === "failed" || status === "rejected") {
    tone =
      "border-[var(--scene-oxblood-bright)]/40 bg-[var(--scene-oxblood)]/10 text-[var(--scene-oxblood-bright)]";
  }
  return (
    <span
      className={`scene-mono inline-flex items-center rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.3em] ${tone}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
