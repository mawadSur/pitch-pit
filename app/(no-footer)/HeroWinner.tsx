"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Shape produced by app/(no-footer)/page.tsx and threaded into the
// HomeScene client tree. Kept inline (rather than in ./types) so the
// dynamically-imported HeroWinner chunk doesn't pull anything that
// LastWeekVerdicts also imports — keeps the above-fold bundle clean.
export type WinnerHero = {
  id: string;
  title: string;
  /** First-sentence excerpt of the pitch, ≤140 chars. Server already
   *  trims this. Empty string is acceptable. */
  excerpt: string;
  verdict: string;
  finalScore: number | null;
  /** Present when the build has completed (status='built'). Null while
   *  the MVP is still being assembled (status='building'). */
  mvpUrl: string | null;
  /** Pre-computed link to the dedicated winner page. */
  href: string;
  /** True when the row was found via status='built' (vs the
   *  'building' fallback). Drives the "Built" vs "Building now" eyebrow. */
  isBuilt: boolean;
};

interface HeroWinnerProps {
  winner: WinnerHero | null;
}

// Full-bleed glass winner block. Sits above the fold on / between the
// cinematic capture panel and the judge panel — first thing returning
// visitors see, anchors "this is real, a thing actually shipped."
//
// Behavior:
//   - status='built'  → "Built" eyebrow, "Visit MVP →" primary CTA
//     (opens mvp_url in a new tab) + "Read the verdict →" secondary
//   - status='building' → "Building now" eyebrow, "Watch the build →"
//     primary CTA pointing at /winner/[id]
//   - winner === null → "First winner ships Monday" placeholder block,
//     so the slot never reads empty (CEO note: above-fold should never
//     have visible holes on a fresh DB)
export function HeroWinner({ winner }: HeroWinnerProps) {
  if (!winner) {
    return <HeroWinnerPlaceholder />;
  }

  const eyebrow = winner.isBuilt ? "Last week's winner" : "Building now";
  const primaryCta = winner.isBuilt
    ? winner.mvpUrl
      ? { label: "Visit MVP", href: winner.mvpUrl, external: true }
      : { label: "Read the verdict", href: winner.href, external: false }
    : { label: "Watch the build", href: winner.href, external: false };

  return (
    <section
      aria-labelledby="hero-winner-heading"
      className="scene relative border-y border-white/6 bg-[#0a0a0a] px-6 py-16 sm:px-10 sm:py-20 lg:py-24"
    >
      {/* Ambient gold radial behind the card — anchors the eye and
          provides cinematic warmth without bringing back the heavier
          scroll-driven canvases from the panels. Pointer-events-none
          so it doesn't interfere with the CTAs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 40%, rgba(255,184,0,0.10) 0%, transparent 65%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-5xl"
      >
        <div className="scene-card-gold relative overflow-hidden px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
            <div className="min-w-0">
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.78rem]">
                ↘ {eyebrow}
              </p>
              <h2
                id="hero-winner-heading"
                className="scene-display mt-4 text-balance text-[1.875rem] leading-[1.04] text-white sm:text-4xl lg:text-5xl"
              >
                {winner.title}
              </h2>
              {winner.verdict && (
                <p className="scene-display-italic mt-5 max-w-2xl text-balance text-base leading-relaxed text-[var(--scene-gold-bright)]/95 sm:text-lg">
                  &ldquo;{winner.verdict}&rdquo;
                </p>
              )}
              {winner.excerpt && (
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 sm:text-base">
                  {winner.excerpt}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-4">
                {primaryCta.external ? (
                  <a
                    href={primaryCta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-btn-primary text-sm"
                  >
                    {primaryCta.label} <span aria-hidden>→</span>
                  </a>
                ) : (
                  <Link
                    href={primaryCta.href}
                    className="cta-btn-primary text-sm"
                  >
                    {primaryCta.label} <span aria-hidden>→</span>
                  </Link>
                )}
                {/* Secondary: always link to the dedicated /winner page.
                    When the primary is "Visit MVP" this lets visitors see
                    the build trace; when the primary is the verdict, this
                    is redundant and suppressed. */}
                {winner.isBuilt && winner.mvpUrl && (
                  <Link href={winner.href} className="cta-btn-ghost text-sm">
                    See the verdict
                  </Link>
                )}
              </div>

              {/* Proof caption — turns the trophy into evidence. The whole
                  product hinges on "is the free build real?"; this line
                  answers it and de-risks ownership in one breath. Gated on
                  isBuilt: the "shipped" claim is false while still building. */}
              {winner.isBuilt && winner.mvpUrl && (
                <p className="scene-mono mt-6 text-[0.6rem] uppercase tracking-[0.32em] text-white/45 sm:text-[0.65rem]">
                  We promised a free build. This is it — no equity, shipped
                  under their name.
                </p>
              )}
            </div>

            {/* Score numeral — anchored top-right on large screens,
                stacks above the title on mobile (handled by grid). The
                "/100" caption uses the smaller mono tier to read as a
                unit rather than competing with the numeral. */}
            {winner.finalScore != null && (
              <div className="flex shrink-0 flex-col items-start lg:items-end">
                <p className="scene-mono text-[0.55rem] uppercase tracking-[0.42em] text-white/55">
                  Final score
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className="scene-numeral text-[5.5rem] text-[var(--scene-gold-bright)] sm:text-[6.5rem] lg:text-[7.25rem]"
                    aria-label={`Final score ${winner.finalScore} of 100`}
                    style={{
                      textShadow:
                        "0 0 24px rgba(255,184,0,0.35), 0 0 64px rgba(255,184,0,0.18)",
                    }}
                  >
                    {winner.finalScore}
                  </span>
                  <span className="scene-mono text-base text-white/55 sm:text-lg">
                    /100
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// Empty-DB / pre-first-winner placeholder. Renders the same chrome as
// the populated block so the section's vertical real estate is stable —
// avoids a layout shift when the first build ships and ISR repopulates
// this slot.
function HeroWinnerPlaceholder() {
  return (
    <section
      aria-labelledby="hero-winner-heading"
      className="scene relative border-y border-white/6 bg-[#0a0a0a] px-6 py-16 sm:px-10 sm:py-20 lg:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 40%, rgba(255,184,0,0.08) 0%, transparent 65%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-5xl"
      >
        <div className="scene-card relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <p className="scene-mono text-[0.65rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.78rem]">
            ↘ The pact
          </p>
          <h2
            id="hero-winner-heading"
            className="scene-display mx-auto mt-4 max-w-2xl text-balance text-[1.875rem] leading-[1.04] text-white sm:text-4xl lg:text-5xl"
          >
            First winner ships{" "}
            <span className="scene-display-italic text-[var(--scene-gold-bright)]">
              Monday
            </span>
            .
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
            The pit closes Monday at midnight EST. The top combined score
            wins a free MVP build — shipped, broadcast, your name on it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/leaderboard" className="cta-btn-primary text-sm">
              See the leaderboard <span aria-hidden>→</span>
            </Link>
            <Link href="/rules" className="cta-btn-ghost text-sm">
              How scoring works
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
