"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { cn } from "@/lib/utils";

const TOC_SECTIONS = [
  { id: "formula", label: "Formula" },
  { id: "rubric", label: "AI rubric" },
  { id: "vote", label: "Community vote" },
  { id: "pact", label: "The pact" },
] as const;

const RUBRIC = [
  { label: "Problem severity", points: 20, body: "Painful, urgent, expensive, frequent, or mandatory?" },
  { label: "Market potential", points: 15, body: "Large, growing, reachable, willing to pay?" },
  { label: "Founder insight", points: 15, body: "Unique angle, unfair advantage, non-obvious." },
  { label: "Solution quality", points: 15, body: "Clear, useful, materially better than alternatives." },
  { label: "Execution feasibility", points: 10, body: "MVP buildable quickly without heroics." },
  { label: "Defensibility / moat", points: 10, body: "Hard to copy in six months." },
  { label: "Distribution", points: 10, body: "Believable path to first 100 users." },
  { label: "Pitch clarity", points: 5, body: "Concise, understandable, compelling." },
];

const RULES = [
  "Each person gets a maximum of 2 lifetime idea submissions.",
  "Submissions must be original or describe your unique angle clearly.",
  "Ideas are grouped into weekly competitions.",
  "Each weekly pit opens Tuesday 12:00 AM and closes the following Monday at midnight EST.",
  "AI scoring runs at submission time. Admins may refresh scores.",
  "Public voting stays open until the weekly deadline.",
  "One vote per user, per idea. You cannot vote for your own.",
  "Fake accounts, vote rings, copied ideas, and abuse will be removed.",
  "The weekly winner is the idea with the highest final score.",
  "The winner receives a free MVP build, scoped with the team.",
  "We may contact the winner to clarify before building.",
];

export function RulesScene() {
  const [activeId, setActiveId] = useState<string>(TOC_SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top with intersectionRatio > 0
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Trigger when section is in the upper-middle of the viewport
        rootMargin: "-25% 0px -50% 0px",
        threshold: 0,
      },
    );

    TOC_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <>
        <MinimalistHeader />
      <main id="main" tabIndex={-1} className="scene relative isolate min-h-dvh overflow-hidden bg-black">
        {/* Sticky TOC sidebar (desktop only) */}
        <nav
          aria-label="Rules sections"
          className="pointer-events-none fixed right-8 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
        >
          <div className="pointer-events-auto flex flex-col gap-3 rounded-full border border-white/10 bg-[#0e0e10]/70 px-3 py-4 backdrop-blur-md">
            {TOC_SECTIONS.map((s) => {
              const isActive = activeId === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className="group flex items-center gap-3"
                >
                  <span
                    className={cn(
                      "block h-1.5 w-1.5 rounded-full transition-all duration-200",
                      isActive
                        ? "bg-[var(--scene-gold-bright)] shadow-[0_0_8px_rgba(255,184,0,0.85)]"
                        : "bg-white/30 group-hover:bg-white/65",
                    )}
                  />
                  <span
                    className={cn(
                      "scene-mono text-[0.6rem] uppercase tracking-[0.3em] transition-colors duration-200",
                      isActive
                        ? "text-[var(--scene-gold-bright)]"
                        : "text-white/45 group-hover:text-white/80",
                    )}
                  >
                    {s.label}
                  </span>
                </a>
              );
            })}
          </div>
        </nav>

        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam-narrow" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
          {/* HEADER */}
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
              ↘ Rules of the pit
            </p>
            <h1 className="mt-5 text-balance text-[2.5rem] font-medium leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Read the room.{" "}
              <span className="italic text-[var(--scene-gold-bright)]">
                Then climb it.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
              Short list. Strict enforcement. Two shots forever, infinite
              chances to vote, one winner every week.
            </p>
          </motion.header>

          {/* SCORING FORMULA */}
          <motion.section
            id="formula"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6 }}
            className="scene-card-gold mt-20 scroll-mt-24 px-7 py-7 text-center sm:px-10 sm:py-8"
          >
            <p className="scene-mono text-[0.6rem] uppercase tracking-[0.35em] text-[var(--scene-gold)]">
              Final score
            </p>
            <p className="mt-3 text-2xl font-medium leading-snug text-white sm:text-3xl">
              <span className="text-[var(--scene-gold-bright)]">50%</span>{" "}
              AI score{" "}
              <span className="text-white/45">+</span>{" "}
              <span className="text-[var(--scene-gold-bright)]">50%</span>{" "}
              community vote
            </p>
            <p className="scene-mono mx-auto mt-3 max-w-md text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
              Live updates · machine and crowd weighted equally
            </p>
          </motion.section>

          {/* AI RUBRIC */}
          <motion.section
            id="rubric"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6 }}
            className="mt-24 scroll-mt-24"
          >
            <SectionHeading kicker="01" title="The AI rubric" sub="0–100 across eight dimensions." />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {RUBRIC.map((r, i) => (
                <RubricRow key={r.label} {...r} index={i} />
              ))}
            </ul>
          </motion.section>

          {/* COMMUNITY VOTE */}
          <motion.section
            id="vote"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6 }}
            className="mt-24 scroll-mt-24"
          >
            <SectionHeading kicker="02" title="The community vote" sub="One vote per idea, per person." />
            <div className="scene-card mt-8 px-7 py-7 sm:px-9 sm:py-8">
              <p className="scene-mono text-[0.6rem] uppercase tracking-[0.35em] text-white/55">
                vote_score = idea_votes / top_idea_votes × 100
              </p>
              <ul className="mt-5 space-y-3 text-base text-white/82">
                <li className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="text-[var(--scene-gold)]">▸</span>
                  Self-votes are blocked.
                </li>
                <li className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="text-[var(--scene-gold)]">▸</span>
                  Live updates — final score recomputes with every vote.
                </li>
                <li className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="text-[var(--scene-gold)]">▸</span>
                  Anti-manipulation: rapid clusters, alts, and copy-pastes get flagged.
                </li>
                <li className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="text-[var(--scene-gold)]">▸</span>
                  Empty week → community score starts at 0.
                </li>
              </ul>
            </div>
          </motion.section>

          {/* RULES LIST */}
          <motion.section
            id="pact"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.6 }}
            className="mt-24 scroll-mt-24"
          >
            <SectionHeading kicker="03" title="The pact" sub="The rules, in plain language." />
            <ol className="scene-card mt-8 divide-y divide-white/[0.06]">
              {RULES.map((rule, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[auto_1fr] gap-5 px-6 py-4 sm:px-8"
                >
                  <span className="scene-mono pt-0.5 text-[0.7rem] tabular-nums text-white/30">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-base leading-relaxed text-white/85">
                    {rule}
                  </span>
                </li>
              ))}
            </ol>
            <p className="scene-mono mt-6 text-center text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
              · To the victor go the tokens ·
            </p>
          </motion.section>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6 }}
            className="mt-24 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/submissions" className="cta-btn-primary">
              Pitch your idea <span aria-hidden>→</span>
            </Link>
            <Link href="/leaderboard" className="cta-btn-ghost">
              View leaderboard
            </Link>
          </motion.div>
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 sm:bottom-8 sm:right-8">
          <CornerSparkle size={26} />
        </div>
      </main>
      </>
    </MotionConfig>
  );
}

function SectionHeading({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub: string;
}) {
  return (
    <header className="text-center">
      <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
        {kicker}
      </p>
      <h2 className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-base text-white/65">{sub}</p>
    </header>
  );
}

function RubricRow({
  label,
  points,
  body,
  index,
}: {
  label: string;
  points: number;
  body: string;
  index: number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-5% 0px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="scene-card px-6 py-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-medium text-white sm:text-lg">{label}</p>
        <p className="scene-mono text-[0.7rem] tabular-nums text-white/55">
          <span className="text-[var(--scene-gold-bright)]">{points}</span>
          <span className="text-white/55"> / 100</span>
        </p>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-white/65">{body}</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${points}%` }}
          viewport={{ once: true, margin: "-5% 0px" }}
          transition={{ duration: 0.8, delay: index * 0.05 + 0.1, ease: "easeOut" }}
          className="h-full rounded-full bg-[var(--scene-gold)]"
        />
      </div>
    </motion.li>
  );
}
