import Link from "next/link";
import type { Metadata } from "next";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of using pitch-pit.",
};

const LAST_UPDATED = "May 2026";

export default function TermsPage() {
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
            Terms of use
          </p>
          <h1 className="mt-3 text-4xl font-medium leading-tight text-white sm:text-5xl">
            The pact between us.
          </h1>
          <p className="scene-mono mt-3 text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            Last updated · {LAST_UPDATED}
          </p>

          <Section title="What you agree to">
            <List
              items={[
                "You own your pitches. By submitting, you grant pitch-pit a non-exclusive license to display them publicly on this site.",
                "Pitches must be your own work. Don't submit other people's ideas without permission.",
                "Don't submit content that violates the law, harasses people, or breaks the moderation policy (hate speech, doxxing, fraud, instructions for serious harm).",
                "One vote per account per idea. Don't game the leaderboard with multiple accounts.",
              ]}
            />
          </Section>

          <Section title="What we promise">
            <List
              items={[
                "We'll score every submission impartially with the same rubric.",
                "We'll publish weekly winners and build the top idea as a free MVP, on a best-effort schedule.",
                "We won't relicense or sell your pitches. They're yours.",
              ]}
            />
          </Section>

          <Section title="What we don't promise">
            <List
              items={[
                "Uptime — this is a side project. We aim for reliable, but no SLA.",
                "AI scores are opinions, not investment advice.",
                "The 'winning idea gets built' commitment is best-effort and depends on feasibility, IP clearance, and our bandwidth.",
              ]}
            />
          </Section>

          <Section title="Removal & disputes">
            <p>
              We can remove submissions that violate these terms or moderation
              policy at our discretion. If you think we got it wrong, email{" "}
              <a
                href="mailto:hello@pitch-pit.app"
                className="text-[var(--scene-gold-bright)] underline-offset-4 hover:underline"
              >
                hello@pitch-pit.app
              </a>
              .
            </p>
          </Section>

          <Section title="Liability">
            <p>
              pitch-pit is provided &ldquo;as is&rdquo; without warranty. To the
              fullest extent allowed by law, we&rsquo;re not liable for damages
              arising from your use of the service.
            </p>
          </Section>

          <div className="mt-16 border-t border-white/8 pt-8">
            <Link
              href="/"
              className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45 hover:text-white"
            >
              ← Back to the arena
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
    <section className="mt-12">
      <h2 className="scene-mono text-[0.7rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed text-white/80 sm:text-lg">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-2.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[var(--scene-gold)]/55"
          />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}
