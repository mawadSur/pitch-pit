// pitch-pit logo — two variants:
//   <Logo variant="mark" />      → just the symbol
//   <Logo variant="lockup" />    → symbol + wordmark in a horizontal row
//
// The mark is a geometric V (the "pit" cross-section): two diagonal gold
// lines converging to an apex, with a glowing gold token at the point.
// A thin rim line above the V suggests the pit's mouth. Pure SVG, scales
// crisp from 16px favicon through giant brand mark.

import { cn } from "@/lib/utils";

type Variant = "mark" | "lockup";

interface LogoProps {
  size?: number; // height in px (mark uses square; lockup matches mark height)
  variant?: Variant;
  monochrome?: boolean; // render gold elements as currentColor
  className?: string;
  wordClassName?: string;
}

export function Logo({
  size = 24,
  variant = "lockup",
  monochrome = false,
  className,
  wordClassName,
}: LogoProps) {
  if (variant === "mark") {
    return <PitMark size={size} monochrome={monochrome} className={className} />;
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PitMark size={size} monochrome={monochrome} />
      <span
        className={cn(
          "text-[0.95em] font-medium leading-none tracking-[-0.013em] text-white",
          wordClassName,
        )}
        style={{ fontSize: `${Math.round(size * 0.78)}px` }}
      >
        pitch
        <span aria-hidden className="opacity-55">
          ‒
        </span>
        pit
      </span>
    </span>
  );
}

function PitMark({
  size = 24,
  monochrome = false,
  className,
}: {
  size?: number;
  monochrome?: boolean;
  className?: string;
}) {
  const stroke = monochrome ? "currentColor" : "url(#pp-mark-stroke)";
  const tokenFill = monochrome ? "currentColor" : "url(#pp-mark-token)";
  const rim = monochrome ? "currentColor" : "#FFB800";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="pitch-pit"
      className={className}
    >
      <defs>
        {/* stroke gradient — slight luminance from rim down toward apex */}
        <linearGradient id="pp-mark-stroke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE7A3" />
          <stop offset="55%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#9A7100" />
        </linearGradient>
        {/* token glow — bright core fading to deep gold */}
        <radialGradient id="pp-mark-token" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#FFF2C4" />
          <stop offset="55%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#8B6500" />
        </radialGradient>
        {/* outer halo — soft glow behind the token */}
        <radialGradient id="pp-mark-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFB800" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFB800" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* token halo — scales nicely; barely visible at 16px, atmospheric at 48px+ */}
      <circle cx="16" cy="24.5" r="6" fill="url(#pp-mark-halo)" />

      {/* pit's mouth — subtle horizontal rim above the V */}
      <line
        x1="6.5"
        y1="9"
        x2="25.5"
        y2="9"
        stroke={rim}
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.42"
      />

      {/* the V — two diagonal walls converging to the apex */}
      <path
        d="M4.5 9 L16 24.5 L27.5 9"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* token at the apex */}
      <circle
        cx="16"
        cy="24.5"
        r="2.6"
        fill={tokenFill}
        stroke={monochrome ? "currentColor" : "#FFE7A3"}
        strokeWidth="0.4"
      />

      {/* tiny inner highlight on the token for the "polished" feel */}
      <circle
        cx="15.4"
        cy="23.9"
        r="0.7"
        fill="#FFF7DD"
        opacity={monochrome ? "0" : "0.85"}
      />
    </svg>
  );
}
