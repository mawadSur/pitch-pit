"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { cn } from "@/lib/utils";

export type BuiltIdea = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  score: number;
  verdict: string;
  mvp_url: string | null;
  screenshot_url: string | null;
  updated_at: string;
};

export function GalleryScene({ ideas }: { ideas: BuiltIdea[] }) {
  return (
    <>
      <MinimalistHeader />
      <main id="main" className="scene relative isolate min-h-dvh overflow-hidden bg-black">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam-narrow" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
          {/* HEADER */}
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
              ↘ The gallery
            </p>
            <h1 className="mt-5 text-balance text-[2.25rem] font-medium leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Built and{" "}
              <span className="italic text-[var(--scene-gold-bright)]">
                shipped
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
              Tributes the Capitol marked, built, and broadcast under the
              founder&rsquo;s name.
            </p>
          </motion.header>

          {ideas.length === 0 ? (
            <EmptyGallery />
          ) : (
            <ol className="mt-20 space-y-24 sm:space-y-32">
              {ideas.map((idea, i) => (
                <li key={idea.id}>
                  <Entry idea={idea} index={i} />
                </li>
              ))}
            </ol>
          )}

          <div className="mt-20 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/submit" className="cta-btn-primary text-sm">
              Pitch your idea <span aria-hidden>→</span>
            </Link>
            <Link href="/leaderboard" className="cta-btn-ghost text-sm">
              View leaderboard
            </Link>
          </div>
        </div>

      </main>
    </>
  );
}

function Entry({ idea, index }: { idea: BuiltIdea; index: number }) {
  const reverse = index % 2 === 1;
  const ordinal = String(index + 1).padStart(2, "0");

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.7 }}
      className={cn(
        "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
        reverse && "lg:[&>*:first-child]:order-last",
      )}
    >
      <div>
        {idea.mvp_url && (
          <MvpFrame
            url={idea.mvp_url}
            screenshotUrl={idea.screenshot_url}
            title={idea.title}
          />
        )}
      </div>

      <div className={cn("max-w-xl", reverse ? "lg:ml-auto" : "")}>
        <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
          № {ordinal} &nbsp;·&nbsp; Score {idea.score}
        </p>
        <h2 className="mt-4 text-3xl font-medium leading-tight text-white sm:text-4xl">
          {idea.title}
        </h2>
        {idea.handle && (
          <p className="scene-mono mt-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
            {idea.handle}
          </p>
        )}

        <p className="mt-5 border-l-2 border-[var(--scene-gold)]/45 pl-4 text-lg italic leading-snug text-white sm:text-xl">
          &ldquo;{idea.verdict}&rdquo;
        </p>

        <p className="mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
          {idea.pitch}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          {idea.mvp_url && (
            <a
              href={idea.mvp_url}
              target="_blank"
              rel="noreferrer"
              className="cta-btn-primary text-sm"
            >
              Open the build <span aria-hidden>↗</span>
            </a>
          )}
          <Link
            href={`/idea/${idea.id}`}
            className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
          >
            Read the judgment →
          </Link>
        </div>
      </div>
    </motion.article>
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
      className="scene-card-gold group relative block overflow-hidden transition-shadow"
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
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-gold)] motion-safe:animate-pulse" />
          <span className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-[var(--scene-gold-bright)]">
            Live · {hostname(url)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <span className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white">
              Enter
            </span>
          </span>
          <span
            aria-hidden
            className="text-2xl text-[var(--scene-gold-bright)] transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </div>
      </div>
    </a>
  );
}

function EmptyGallery() {
  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <Pedestal />
      <h2 className="mt-10 text-balance text-3xl font-medium tracking-tight text-white sm:text-4xl">
        The first champion has yet to{" "}
        <span className="italic text-[var(--scene-gold-bright)]">rise</span>.
      </h2>
      <p className="mx-auto mt-5 max-w-xl text-base italic text-white/65 sm:text-lg">
        No tribute has been built. The pedestal awaits the worthy.
      </p>
      <p className="scene-mono mx-auto mt-3 max-w-xl text-[0.65rem] uppercase tracking-[0.3em] text-white/35">
        Earn a high score · be greenlit · watch your idea take form
      </p>
    </div>
  );
}

function Pedestal() {
  return (
    <svg
      width="280"
      height="240"
      viewBox="0 0 280 240"
      fill="none"
      role="img"
      aria-label="Empty pedestal"
      className="opacity-85"
    >
      <defs>
        <linearGradient id="pedGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD17A" />
          <stop offset="50%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#8B6500" />
        </linearGradient>
        <radialGradient id="pedGlow" cx="50%" cy="40%" r="40%">
          <stop offset="0%" stopColor="#FFD17A" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFB800" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* halo + sparkles */}
      <ellipse
        cx="140"
        cy="80"
        rx="100"
        ry="46"
        fill="url(#pedGlow)"
        className="motion-safe:animate-[pulse_3.4s_ease-in-out_infinite]"
      />
      <g fill="#FFD17A">
        <circle cx="140" cy="58" r="1.6" />
        <circle cx="105" cy="78" r="1.2" />
        <circle cx="172" cy="72" r="1.3" />
        <circle cx="125" cy="92" r="1" />
        <circle cx="158" cy="48" r="1.5" />
      </g>

      {/* plinth top */}
      <rect x="80" y="125" width="120" height="6" fill="url(#pedGold)" />
      <rect x="92" y="135" width="96" height="70" fill="url(#pedGold)" opacity="0.92" />
      <g stroke="#0a0a0a" strokeWidth="1" opacity="0.45">
        <line x1="106" y1="138" x2="106" y2="200" />
        <line x1="120" y1="138" x2="120" y2="200" />
        <line x1="134" y1="138" x2="134" y2="200" />
        <line x1="148" y1="138" x2="148" y2="200" />
        <line x1="162" y1="138" x2="162" y2="200" />
        <line x1="176" y1="138" x2="176" y2="200" />
      </g>
      <rect
        x="115"
        y="158"
        width="50"
        height="22"
        fill="#0a0a0a"
        stroke="#FFB800"
        strokeWidth="0.6"
      />
      <path d="M140 165 L145 169 L140 173 L135 169 Z" fill="#FFB800" />

      {/* base */}
      <rect x="74" y="209" width="132" height="10" fill="url(#pedGold)" />
      <rect x="68" y="219" width="144" height="6" fill="url(#pedGold)" opacity="0.78" />
      <ellipse cx="140" cy="232" rx="80" ry="4" fill="#0a0a0a" opacity="0.55" />
    </svg>
  );
}
