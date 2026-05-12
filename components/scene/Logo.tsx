// pitch-pit logo — two variants:
//   <Logo variant="mark" />      → just the symbol
//   <Logo variant="lockup" />    → symbol + wordmark in a horizontal row
//
// The mark is a minimal hourglass glyph — two triangular cones joined at
// a narrow neck, geometry derived from the full Hourglass.tsx component
// (viewBox 0 0 120 180). Gold stroke on transparent, reads crisp from
// 16px favicon through large brand mark. The wordmark "pitch-pit" sits
// alongside in the lockup variant.

import { cn } from "@/lib/utils";

type Variant = "mark" | "lockup";

interface LogoProps {
  size?: number; // height in px (mark is 2:3 aspect; lockup matches mark height)
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
    return <HourglassMark size={size} monochrome={monochrome} className={className} />;
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <HourglassMark size={size} monochrome={monochrome} />
      <span
        className={cn(
          "whitespace-nowrap text-[0.95em] font-medium leading-none tracking-[-0.013em] text-white",
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

// Minimal hourglass glyph — geometry mirrors Hourglass.tsx (120×180 viewBox).
// Top cone: wide at y=2 (cap top), narrows to neck at y=88-94.
// Bottom cone: neck at y=88-94, widens to y=178 (cap bottom).
// Horizontal cap bars at top and bottom echo the brushed-gold caps.
function HourglassMark({
  size = 24,
  monochrome = false,
  className,
}: {
  size?: number;
  monochrome?: boolean;
  className?: string;
}) {
  const gold = monochrome ? "currentColor" : "#FFB800";
  // Hourglass is 2:3 aspect (120×180 viewBox). Render width proportionally.
  const w = Math.round(size * (2 / 3));

  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 120 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="pitch-pit"
      className={className}
    >
      {/* top cap bar */}
      <rect x="14" y="2" width="92" height="8" rx="1.5" fill={gold} />
      {/* top cone — wide at cap, narrows to neck */}
      <path d="M 18 10 L 102 10 L 64 88 L 56 88 Z" fill={gold} opacity="0.15" />
      <path
        d="M 18 10 L 56 88 M 102 10 L 64 88"
        stroke={gold}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* neck connector */}
      <rect x="56" y="88" width="8" height="6" fill={gold} opacity="0.55" />
      {/* bottom cone — neck to wide base */}
      <path d="M 56 94 L 64 94 L 102 170 L 18 170 Z" fill={gold} opacity="0.15" />
      <path
        d="M 56 94 L 18 170 M 64 94 L 102 170"
        stroke={gold}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* bottom cap bar */}
      <rect x="14" y="170" width="92" height="8" rx="1.5" fill={gold} />
      {/* sand dots — two small circles suggesting fallen sand in the bottom */}
      <circle cx="60" cy="148" r="2.5" fill={gold} opacity="0.7" />
      <circle cx="52" cy="162" r="2" fill={gold} opacity="0.5" />
      <circle cx="68" cy="162" r="2" fill={gold} opacity="0.5" />
    </svg>
  );
}
