import { cn } from "@/lib/utils";

interface SealProps {
  size?: number;
  className?: string;
  monogram?: string;
}

export function Seal({
  size = 240,
  className,
  monogram = "PP",
}: SealProps) {
  const id = "seal-grad";
  return (
    <svg
      className={cn("drop-shadow-[0_18px_60px_rgba(0,0,0,0.7)]", className)}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="pitch-pit seal"
    >
      <defs>
        <radialGradient id={id} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#e3c576" />
          <stop offset="55%" stopColor="#c9a961" />
          <stop offset="100%" stopColor="#8b6f3a" />
        </radialGradient>
        <radialGradient id={`${id}-inner`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#241414" />
          <stop offset="100%" stopColor="#0d0a0a" />
        </radialGradient>
      </defs>

      {/* outer thick ring */}
      <circle cx="100" cy="100" r="96" fill={`url(#${id})`} />
      {/* engraved channel */}
      <circle
        cx="100"
        cy="100"
        r="86"
        fill={`url(#${id}-inner)`}
        stroke="#8b6f3a"
        strokeWidth="0.8"
      />
      {/* tiny engraved divots around the outer ring */}
      {Array.from({ length: 48 }).map((_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        const cx = 100 + Math.cos(angle) * 91;
        const cy = 100 + Math.sin(angle) * 91;
        return <circle key={i} cx={cx} cy={cy} r="0.9" fill="#0d0a0a" opacity="0.55" />;
      })}

      {/* inner rings */}
      <circle cx="100" cy="100" r="74" fill="none" stroke="#c9a961" strokeWidth="1.2" opacity="0.85" />
      <circle cx="100" cy="100" r="68" fill="none" stroke="#c9a961" strokeWidth="0.5" opacity="0.5" />

      {/* radiant rays from center */}
      <g stroke="#c9a961" strokeWidth="0.6" opacity="0.4">
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2;
          const x1 = 100 + Math.cos(angle) * 26;
          const y1 = 100 + Math.sin(angle) * 26;
          const x2 = 100 + Math.cos(angle) * 60;
          const y2 = 100 + Math.sin(angle) * 60;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>

      {/* laurel arc — bottom */}
      <g
        stroke="#c9a961"
        strokeWidth="1"
        fill="#c9a961"
        opacity="0.85"
        strokeLinecap="round"
      >
        <path d="M 50 130 Q 100 175 150 130" fill="none" opacity="0.6" />
        {Array.from({ length: 7 }).map((_, i) => {
          const t = (i + 1) / 8;
          const x = 50 + (150 - 50) * t;
          const y = 130 + Math.sin(t * Math.PI) * 28;
          return (
            <ellipse
              key={`lL${i}`}
              cx={x - 4}
              cy={y - 4}
              rx="5"
              ry="2.2"
              transform={`rotate(${-30 + t * 60} ${x} ${y})`}
            />
          );
        })}
        {Array.from({ length: 7 }).map((_, i) => {
          const t = (i + 1) / 8;
          const x = 50 + (150 - 50) * t;
          const y = 130 + Math.sin(t * Math.PI) * 28;
          return (
            <ellipse
              key={`lR${i}`}
              cx={x + 4}
              cy={y + 4}
              rx="5"
              ry="2.2"
              transform={`rotate(${30 - t * 60} ${x} ${y})`}
            />
          );
        })}
      </g>

      {/* center monogram */}
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fontFamily="var(--font-display), Cinzel, serif"
        fontWeight="800"
        fontSize="56"
        letterSpacing="-2"
        fill="#e3c576"
        style={{ filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.6))" }}
      >
        {monogram}
      </text>

      {/* central diamond above monogram */}
      <g transform="translate(100 56)" fill="#c9a961" opacity="0.85">
        <path d="M0 -7 L4 0 L0 7 L-4 0 Z" />
      </g>
    </svg>
  );
}
