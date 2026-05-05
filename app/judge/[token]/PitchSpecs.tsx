// Sticky sidebar showing the user's submitted pitch parsed into "specs."
// No async work here — pure server component.
export function PitchSpecs({
  title,
  pitch,
  handle,
}: {
  title: string;
  pitch: string;
  handle: string | null;
}) {
  const charCount = pitch.length;
  const wordCount = pitch.trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 220));

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        {/* gold left bar */}
        <div className="absolute left-0 top-6 bottom-6 w-[2px] bg-[var(--scene-gold)]/60" />

        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/50">
          The pitch
        </p>
        <h2 className="mt-3 text-lg font-medium leading-snug text-white line-clamp-3">
          {title}
        </h2>

        <dl className="mt-6 space-y-0">
          <Row label="Words" value={`${wordCount}`} />
          <Row label="Characters" value={`${charCount}`} />
          <Row label="Read time" value={`~${readingMinutes} min`} />
          {handle && <Row label="Founder" value={`@${handle.replace(/^@/, "")}`} />}
          <Row label="Length" value={lengthBucket(charCount)} />
          <Row label="Submitted" value="just now" last />
        </dl>

        <details className="mt-6 group">
          <summary className="scene-mono cursor-pointer list-none text-[0.65rem] uppercase tracking-[0.32em] text-white/50 hover:text-white/70">
            <span className="group-open:hidden">▸ Read full pitch</span>
            <span className="hidden group-open:inline">▾ Hide pitch</span>
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
            {pitch}
          </p>
        </details>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        last ? "" : "border-b border-white/[0.06]"
      }`}
    >
      <dt className="scene-mono text-[0.65rem] uppercase tracking-[0.16em] text-white/50">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums text-white/90">{value}</dd>
    </div>
  );
}

function lengthBucket(chars: number): string {
  if (chars < 200) return "Tight";
  if (chars < 600) return "Crisp";
  if (chars < 1100) return "Detailed";
  return "Verbose";
}
