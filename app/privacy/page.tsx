import Link from "next/link";
import type { Metadata } from "next";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How pitch-pit collects, uses, and protects your data.",
};

const LAST_UPDATED = "May 2026";

export default function PrivacyPage() {
  return (
    <>
      <MinimalistHeader />
      <main
        id="main"
        className="scene relative isolate min-h-dvh overflow-hidden"
      >
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-24 sm:py-28">
          <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
            Privacy
          </p>
          <h1 className="mt-3 text-4xl font-medium leading-tight text-white sm:text-5xl">
            What we collect — and what we don&rsquo;t.
          </h1>
          <p className="scene-mono mt-3 text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            Last updated · {LAST_UPDATED}
          </p>

          <Section title="In short">
            <p>
              pitch-pit is a public weekly idea contest. We collect the minimum
              we need to run it: the pitches you submit, the votes you cast,
              and (if you sign in) the email or Google account that proves you
              own them.
            </p>
          </Section>

          <Section title="What we collect">
            <List
              items={[
                "Pitches and idea metadata (title, body, optional handle) — public by design.",
                "Vote records — your account → which idea, used to compute leaderboard scores and prevent double-voting.",
                "Auth identifiers — email, OAuth provider id, display name, avatar URL (Google only).",
                "Operational logs — IP and timestamp on rate-limited endpoints. Discarded after 30 days.",
              ]}
            />
          </Section>

          <Section title="What we don't do">
            <List
              items={[
                "We don't sell your data.",
                "We don't run third-party ad trackers.",
                "We don't share your email with anyone.",
              ]}
            />
          </Section>

          <Section title="Third parties we route data through">
            <List
              items={[
                "Supabase — database, auth, storage. Hosted in their EU/US regions.",
                "Anthropic — your pitch text is sent to Claude for scoring. Anthropic does not train on API content.",
                "Vercel — hosting, edge network, basic analytics (page views + Web Vitals, no per-user tracking).",
              ]}
            />
          </Section>

          <Section title="Your rights">
            <p>
              You can request deletion of your account and all linked data at
              any time by emailing{" "}
              <a
                href="mailto:hello@pitch-pit.app"
                className="text-[var(--scene-gold-bright)] underline-offset-4 hover:underline"
              >
                hello@pitch-pit.app
              </a>
              . Public idea pages stay up unless you ask us to remove them.
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
