// Deterministic gold dust — rendered server-safe (no Math.random in render).

const SEEDS = Array.from({ length: 32 }, (_, i) => ({
  x: (i * 47.31) % 100,
  delay: ((i * 1.13) % 10).toFixed(2),
  duration: 14 + ((i * 3.7) % 12),
  size: 1 + ((i % 5) * 0.55),
  drift: (((i * 19) % 100) - 50).toFixed(0),
  opacity: 0.45 + ((i % 5) * 0.11),
}));

export function Particles({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {SEEDS.map((s, i) => (
        <span
          key={i}
          className="scene-particle motion-reduce:hidden"
          style={
            {
              left: `${s.x}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              ["--delay" as string]: `${s.delay}s`,
              ["--dur" as string]: `${s.duration}s`,
              ["--drift" as string]: `${s.drift}px`,
              ["--max-opacity" as string]: `${s.opacity}`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
