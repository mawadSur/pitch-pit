// Tiny presentational primitives shared by the below-fold section files.
// No "use client" directive — these are pure JSX with no hooks, no
// framer-motion, no event handlers, so they can be transitively bundled
// into any client component that imports them (or stay server-side if
// the importer is a server component).

export function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="scene-mono text-[0.65rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.92rem]">
      {children}
    </p>
  );
}

export function CheckMark() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--scene-gold)]/45 bg-[var(--scene-gold)]/10"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 7.5 L6 10.5 L11.5 4.5"
          stroke="var(--scene-gold-bright)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
