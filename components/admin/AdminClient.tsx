"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  greenlightIdea,
  rejectIdea,
  startBuilding,
  markBuilt,
} from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import { titleToSlug } from "@/lib/slug";

// Idea page link with the SEO-friendly slug appended when derivable.
// Falls back to a slug-less /idea/<uuid> for emoji/non-Latin titles.
function ideaPath(id: string, title: string): string {
  const slug = titleToSlug(title);
  return slug ? `/idea/${id}/${slug}` : `/idea/${id}`;
}

export type AdminIdea = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  score: number;
  verdict: string;
  strengths: string[];
  concerns: string[];
  reasoning: string;
  build_recommended: boolean;
  status: string;
  mvp_url: string | null;
  screenshot_url: string | null;
  created_at: string;
  updated_at: string;
};

type Tab = "pending" | "queued" | "completed";

export function AdminClient({
  pending,
  queued,
  completed,
}: {
  pending: AdminIdea[];
  queued: AdminIdea[];
  completed: AdminIdea[];
}) {
  const [tab, setTab] = useState<Tab>("pending");

  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        counts={{
          pending: pending.length,
          queued: queued.length,
          completed: completed.length,
        }}
      />

      {tab === "pending" && <PendingTable rows={pending} />}
      {tab === "queued" && <QueuedTable rows={queued} />}
      {tab === "completed" && <CompletedTable rows={completed} />}
    </>
  );
}

function Tabs({
  active,
  onChange,
  counts,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  counts: Record<Tab, number>;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "pending", label: "Pending review" },
    { id: "queued", label: "In progress" },
    { id: "completed", label: "Completed" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Admin tabs"
      className="mb-7 flex items-center gap-1 border-b border-white/8"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "scene-mono relative px-4 py-3 text-[0.65rem] uppercase tracking-[0.3em] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]",
              isActive
                ? "text-[var(--scene-gold-bright)]"
                : "text-white/45 hover:text-white/85",
            )}
          >
            {t.label}
            <span
              className={cn(
                "scene-mono ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[0.65rem] tracking-normal",
                isActive
                  ? "bg-[var(--scene-gold)]/15 text-[var(--scene-gold-bright)]"
                  : "bg-white/[0.04] text-white/45",
              )}
            >
              {counts[t.id]}
            </span>
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-px bg-[var(--scene-gold)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function PendingTable({ rows }: { rows: AdminIdea[] }) {
  if (rows.length === 0) return <Empty label="No pitches await judgment." />;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <PendingRow key={row.id} idea={row} />
      ))}
    </div>
  );
}

function PendingRow({ idea }: { idea: AdminIdea }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  function run(action: () => Promise<{ ok?: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const res = await action();
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-white/6 px-5 py-4">
        <span className="scene-mono text-3xl font-medium leading-none tabular-nums text-[var(--scene-gold-bright)]">
          {idea.score}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-white">
            {idea.title}
          </p>
          <p className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            {idea.handle ?? "anonymous"} · id {shortId(idea.id)} ·{" "}
            {new Date(idea.created_at)
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--scene-gold)]/80 transition-colors hover:text-[var(--scene-gold-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
          aria-expanded={expanded}
        >
          {expanded ? "collapse" : "expand"}
        </button>
      </header>

      {expanded && (
        <div className="grid gap-7 px-5 py-5 sm:grid-cols-[1fr_1fr]">
          <section>
            <SectionHeading>Original pitch</SectionHeading>
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {idea.pitch}
            </p>
          </section>

          <section>
            <SectionHeading>Reviewer breakdown</SectionHeading>
            <p className="mt-3 text-sm italic leading-snug text-white/70">
              &ldquo;{idea.verdict}&rdquo;
            </p>
            <DataList label="Strengths" items={idea.strengths} tone="gold" />
            <DataList label="Concerns" items={idea.concerns} tone="muted" />
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              {idea.reasoning}
            </p>
          </section>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 bg-white/[0.015] px-5 py-3.5">
        <span className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
          {idea.build_recommended
            ? "Reviewer recommends build"
            : "Reviewer withholds recommendation"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={ideaPath(idea.id, idea.title)}
            target="_blank"
            className="scene-mono rounded-full border border-white/12 px-3.5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/75 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
          >
            view public
          </Link>
          <button
            type="button"
            onClick={() => run(() => rejectIdea(idea.id))}
            disabled={pending}
            className="scene-mono rounded-full border border-red-400/40 px-3.5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-red-300 transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
          >
            reject
          </button>
          <button
            type="button"
            onClick={() => run(() => greenlightIdea(idea.id))}
            disabled={pending}
            className="cta-btn-primary text-[0.7rem] disabled:opacity-50"
          >
            {pending ? "approving…" : "Greenlight for arena"}
          </button>
        </div>
      </footer>

      {err && (
        <p
          role="alert"
          className="scene-mono border-t border-red-400/40 bg-red-500/10 px-5 py-2.5 text-[0.65rem] uppercase tracking-[0.25em] text-red-300"
        >
          {err}
        </p>
      )}
    </article>
  );
}

function QueuedTable({ rows }: { rows: AdminIdea[] }) {
  if (rows.length === 0)
    return <Empty label="No pitches in the build queue." />;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <QueuedRow key={row.id} idea={row} />
      ))}
    </div>
  );
}

function QueuedRow({ idea }: { idea: AdminIdea }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  // A11y-4: focus the offending URL field on submission failure. The server
  // action returns a free-form error string; if it mentions mvpUrl we focus
  // that input, otherwise screenshotUrl gets focus (and acts as the catch-all
  // "second" field per the form spec).
  const mvpUrlRef = useRef<HTMLInputElement | null>(null);
  const screenshotUrlRef = useRef<HTMLInputElement | null>(null);

  function onMarkBuilt(formData: FormData) {
    setErr(null);
    formData.append("ideaId", idea.id);
    start(async () => {
      const res = await markBuilt(formData);
      if (res?.error) {
        setErr(res.error);
        if (/mvp[\s_-]?url/i.test(res.error)) mvpUrlRef.current?.focus();
        else screenshotUrlRef.current?.focus();
      } else router.refresh();
    });
  }

  function onStart() {
    setErr(null);
    start(async () => {
      const res = await startBuilding(idea.id);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-white/6 px-5 py-4">
        <StatusPill status={idea.status} />
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-white">
            {idea.title}
          </p>
          <p className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            score {idea.score} · {idea.handle ?? "anonymous"} · id{" "}
            {shortId(idea.id)}
          </p>
        </div>
        <Link
          href={ideaPath(idea.id, idea.title)}
          target="_blank"
          className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--scene-gold)]/80 transition-colors hover:text-[var(--scene-gold-bright)]"
        >
          view →
        </Link>
      </header>

      <div className="px-5 py-5">
        {idea.status === "queued" && (
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="scene-mono mb-5 rounded-full border border-[var(--scene-gold)]/55 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-[var(--scene-gold-bright)] transition-colors hover:bg-[var(--scene-gold)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)] disabled:opacity-50"
          >
            {pending ? "moving…" : "Mark as building"}
          </button>
        )}

        <form action={onMarkBuilt} className="grid gap-3">
          <SectionHeading>Inscribe the deployed MVP</SectionHeading>
          <label className="block">
            <span className="scene-mono mb-1.5 block text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
              mvp_url
            </span>
            <input
              ref={mvpUrlRef}
              name="mvpUrl"
              type="url"
              required
              autoComplete="url"
              placeholder="https://..."
              className="block w-full rounded-md border border-white/12 bg-white/[0.02] px-3 py-2.5 scene-mono text-sm text-white placeholder-white/25 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
            />
          </label>
          <label className="block">
            <span className="scene-mono mb-1.5 block text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
              screenshot_url (optional)
            </span>
            <input
              ref={screenshotUrlRef}
              name="screenshotUrl"
              type="url"
              autoComplete="url"
              placeholder="https://..."
              className="block w-full rounded-md border border-white/12 bg-white/[0.02] px-3 py-2.5 scene-mono text-sm text-white placeholder-white/25 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="cta-btn-primary mt-1 self-start text-[0.7rem] disabled:opacity-50"
          >
            {pending ? "sealing…" : "Mark as built · enter the arena"}
          </button>
        </form>

        {err && (
          <p
            role="alert"
            className="scene-mono mt-3 text-[0.65rem] uppercase tracking-[0.25em] text-red-300"
          >
            {err}
          </p>
        )}
      </div>
    </article>
  );
}

function CompletedTable({ rows }: { rows: AdminIdea[] }) {
  if (rows.length === 0)
    return <Empty label="No pitches have entered the arena yet." />;
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-white/[0.025] text-left scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            <th className="border-b border-white/6 px-4 py-3">Score</th>
            <th className="border-b border-white/6 px-4 py-3">Title</th>
            <th className="border-b border-white/6 px-4 py-3">Handle</th>
            <th className="border-b border-white/6 px-4 py-3">MVP</th>
            <th className="border-b border-white/6 px-4 py-3">Built</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-white/[0.025]">
              <td className="border-b border-white/4 px-4 py-3 scene-mono tabular-nums text-[var(--scene-gold-bright)]">
                {r.score}
              </td>
              <td className="border-b border-white/4 px-4 py-3">
                <Link
                  href={ideaPath(r.id, r.title)}
                  className="text-white transition-colors hover:text-[var(--scene-gold-bright)]"
                >
                  {r.title}
                </Link>
              </td>
              <td className="border-b border-white/4 px-4 py-3 text-white/65">
                {r.handle ?? "—"}
              </td>
              <td className="border-b border-white/4 px-4 py-3">
                {r.mvp_url ? (
                  <a
                    href={r.mvp_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--scene-gold)]/80 transition-colors hover:text-[var(--scene-gold-bright)]"
                  >
                    {hostname(r.mvp_url)} ↗
                  </a>
                ) : (
                  <span className="text-white/55">—</span>
                )}
              </td>
              <td className="border-b border-white/4 px-4 py-3 scene-mono text-[0.7rem] text-white/55">
                {r.updated_at.slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
      <p className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
        {label}
      </p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-[var(--scene-gold)]">
      {children}
    </h3>
  );
}

function DataList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "gold" | "muted";
}) {
  if (!items?.length) return null;
  const labelColor =
    tone === "gold" ? "text-[var(--scene-gold)]" : "text-white/55";
  const dotColor =
    tone === "gold" ? "bg-[var(--scene-gold)]" : "bg-white/45";
  return (
    <div className="mt-4">
      <p
        className={cn(
          "scene-mono text-[0.65rem] uppercase tracking-[0.3em]",
          labelColor,
        )}
      >
        {label}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug text-white/80">
        {items.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn(
                "mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full",
                dotColor,
              )}
            />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, string> = {
    queued:
      "border-[var(--scene-gold)]/55 bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]",
    building: "border-amber-400/55 bg-amber-400/10 text-amber-300",
    built:
      "border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/10 text-[var(--scene-gold)]",
  };
  return (
    <span
      className={cn(
        "scene-mono inline-flex items-center rounded-full border px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em]",
        palette[status] ?? "border-white/15 bg-white/[0.04] text-white/65",
      )}
    >
      {status}
    </span>
  );
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
