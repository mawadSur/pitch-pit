"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, Trophy, Hammer } from "lucide-react";

// Bottom-of-page anonymous-only CTA. Per-card lock badges already exist;
// this is the "and here's the bigger picture" anchor.
export function SoftGateCTA({ token }: { token: string }) {
  const loginHref = `/login?next=${encodeURIComponent(`/judge/${token}`)}`;
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="relative overflow-hidden rounded-2xl border border-[var(--scene-gold)]/30 bg-[var(--scene-gold)]/[0.06] p-8 text-center backdrop-blur-md"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/[0.08]">
        <Lock className="h-5 w-5 text-[var(--scene-gold)]" aria-hidden />
      </div>

      <h2 className="mt-5 text-xl font-medium text-white sm:text-2xl">
        The judges said more.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/65">
        Sign in to read the full deliberation, claim this pitch as yours,
        join the leaderboard, and unlock build recommendations.
      </p>

      <ul className="scene-mono mx-auto mt-6 flex max-w-md flex-col items-start gap-2.5 text-sm text-white/75">
        <Bullet icon={<Lock className="h-3.5 w-3.5" />}>
          Full strengths, concerns, and reasoning from each judge
        </Bullet>
        <Bullet icon={<Trophy className="h-3.5 w-3.5" />}>
          Claim your pitch on the public leaderboard
        </Bullet>
        <Bullet icon={<Hammer className="h-3.5 w-3.5" />}>
          If your average lands ≥ 7 — eligible for a free MVP build
        </Bullet>
      </ul>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={loginHref}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scene-gold)] px-6 text-sm font-medium text-black transition-all hover:bg-[var(--scene-gold)]/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
        >
          Sign in to unlock
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center py-2 text-sm text-white/55 underline-offset-4 transition-colors hover:text-white/85 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
        >
          or keep browsing →
        </Link>
      </div>
    </motion.section>
  );
}

function Bullet({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 normal-case tracking-normal">
      <span className="text-[var(--scene-gold)]/80">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
