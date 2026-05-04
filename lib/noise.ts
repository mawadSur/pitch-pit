export function noiseDataUri({
  baseFrequency = 0.9,
  numOctaves = 3,
  size = 200,
}: {
  baseFrequency?: number;
  numOctaves?: number;
  size?: number;
} = {}) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${numOctaves}' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

export function noiseStyle(opacity = 0.06): React.CSSProperties {
  return {
    backgroundImage: noiseDataUri(),
    opacity,
    mixBlendMode: "overlay",
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
  };
}
