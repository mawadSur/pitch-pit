import Link from "next/link";

export default function NotFound() {
  return (
    <main className="scene relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="scene-bg-gradient absolute inset-0" />
      <div className="relative z-10 max-w-md text-center">
        <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
          404
        </p>
        <h1 className="mt-3 text-3xl font-medium text-white sm:text-4xl">
          That tribute never reached the arena.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/65">
          Either the link is wrong, or this idea was never submitted.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="cta-btn-primary text-sm">
            Pitch a new idea
          </Link>
          <Link
            href="/leaderboard"
            className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
          >
            Browse leaderboard →
          </Link>
        </div>
      </div>
    </main>
  );
}
