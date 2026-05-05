import Link from "next/link";
import type { Metadata } from "next";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why pitch-pit exists, how scoring works, and what happens when you win.",
};

export default function AboutPage() {
  return (
    <>
      <MinimalistHeader />
      <main
        id="main"
        tabIndex={-1}
        className="scene relative isolate min-h-dvh overflow-hidden"
      >
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-24 sm:py-28">
          <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
            About pitch-pit
          </p>
          <h1 className="mt-3 text-balance text-4xl font-medium leading-tight text-white sm:text-5xl">
            A weekly contest for ideas that deserve to exist.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/75">
            Most startup ideas die in a notes app. pitch-pit is a public,
            weekly forum for ideas worth pulling out of one. Submit a pitch,
            get rated by an AI reviewer trained on the gstack/YC office-hours
            framework, and let the community decide which one earns a build.
          </p>

          <Section title="How it works">
            <ol className="space-y-3">
              <Step
                n={1}
                title="Submit"
                body="60–1500 characters. Anyone can pitch — anonymous or signed in."
              />
              <Step
                n={2}
                title="Get scored"
                body="Claude Sonnet 4.6 rates your pitch 1–10 across six dimensions: demand, wedge, founder edge, feasibility, defensibility, distribution."
              />
              <Step
                n={3}
                title="Get voted"
                body="The community votes. Final score is 50% AI + 50% community, normalized to 0–100."
              />
              <Step
                n={4}
                title="Win the week"
                body="The pit closes Friday at midnight EDT. The week's top score gets built as a free MVP."
              />
            </ol>
          </Section>

          <Section title="The rubric">
            <p>
              Scoring isn&rsquo;t arbitrary. The AI reviewer evaluates each
              pitch against six fixed dimensions and produces a structured
              verdict — score, strengths, concerns, reasoning. It&rsquo;s the
              same rubric a YC partner would apply in office hours.
            </p>
            <p className="mt-3">
              See the{" "}
              <Link
                href="/rules"
                className="text-[var(--scene-gold-bright)] underline-offset-4 hover:underline"
              >
                full rubric
              </Link>{" "}
              for the breakdown.
            </p>
          </Section>

          <Section title="Why it exists">
            <p>
              Founders don&rsquo;t lack ideas. They lack a forcing function —
              a public moment where an idea has to either survive or die. The
              week is the forcing function. The AI score is the filter. The
              community vote is the gauntlet.
            </p>
            <p className="mt-3">
              If your idea wins, we build it. No equity, no fees, no strings.
              You keep what you ship.
            </p>
          </Section>

          <Section title="Who runs this">
            <p>
              pitch-pit is a side project run by one engineer with too many
              ideas in their own notes app. Reach me at{" "}
              <a
                href="mailto:hello@pitchpit.app"
                className="text-[var(--scene-gold-bright)] underline-offset-4 hover:underline"
              >
                hello@pitchpit.app
              </a>
              .
            </p>
          </Section>

          <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-white/8 pt-8">
            <Link href="/" className="cta-btn-primary text-sm">
              Pitch an idea →
            </Link>
            <Link
              href="/leaderboard"
              className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
            >
              Browse leaderboard
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <h2 className="scene-mono text-[0.7rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-white/80 sm:text-lg">
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-4">
      <span className="scene-mono mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/10 text-xs tabular-nums text-[var(--scene-gold-bright)]">
        {n}
      </span>
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-1 text-base leading-relaxed text-white/72">{body}</p>
      </div>
    </li>
  );
}
