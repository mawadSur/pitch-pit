import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/jetbrains-mono";
import { JUDGES } from "@/lib/judges";
import { DeliberatingCard } from "./DeliberatingCard";
import { AggregateBandPending } from "./AggregateBandPending";
import { MotionWrapper } from "./MotionWrapper";
import "../../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

// Shown immediately on navigation to /judge/[token] while the server
// component is still loading the draft. Mirrors the dashboard layout so
// the transition from / → /judge/[token] feels seamless: the user sees
// the deliberating cards instantly, then the real Suspense boundaries
// take over once the server stream begins.
export default function JudgeLoading() {
  return (
    <div
      className={`scene min-h-screen ${inter.variable} ${jetbrains.variable}`}
      style={{ background: "var(--scene-bg)" }}
    >
      <MotionWrapper>
        <main
          id="main"
          tabIndex={-1}
          className="relative mx-auto max-w-6xl px-4 pt-28 pb-24 sm:px-6 lg:px-8 focus:outline-none"
        >
          <header className="mb-8">
            <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
              ↘ Calling the judges
            </p>
            <h1 className="mt-3 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl">
              Three judges. One pitch.
            </h1>
          </header>

          <AggregateBandPending />

          <div className="mt-10 grid gap-6 lg:grid-cols-[20rem_1fr] lg:gap-10">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="h-48 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md" />
            </aside>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {JUDGES.map((j, idx) => (
                <DeliberatingCard key={j.id} judge={j} index={idx} />
              ))}
            </div>
          </div>
        </main>
      </MotionWrapper>
    </div>
  );
}
