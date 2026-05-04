// Minimalist 3D hourglass — brushed gold caps, glass body, golden sand
// (~2/3 fallen, stream actively flowing). Pure SVG, animated via CSS.

export function Hourglass({ size = 96 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * 1.5);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Time remaining"
      className="block"
    >
      <defs>
        {/* brushed gold (top cap) */}
        <linearGradient id="hg-cap-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff0c2" />
          <stop offset="35%" stopColor="#ffd17a" />
          <stop offset="70%" stopColor="#ffb800" />
          <stop offset="100%" stopColor="#8b6500" />
        </linearGradient>
        {/* brushed gold (bottom cap) */}
        <linearGradient id="hg-cap-bot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b6500" />
          <stop offset="30%" stopColor="#ffb800" />
          <stop offset="65%" stopColor="#ffd17a" />
          <stop offset="100%" stopColor="#fff0c2" />
        </linearGradient>
        {/* glass body — slight inner reflection */}
        <linearGradient id="hg-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
        </linearGradient>
        {/* sand (warm gold) */}
        <linearGradient id="hg-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff2c4" />
          <stop offset="50%" stopColor="#ffd17a" />
          <stop offset="100%" stopColor="#ffb800" />
        </linearGradient>
        {/* halo glow */}
        <radialGradient id="hg-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb800" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#ffb800" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffb800" stopOpacity="0" />
        </radialGradient>
        {/* glow filter for sand */}
        <filter id="hg-sand-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* halo behind everything */}
      <ellipse
        cx="60"
        cy="90"
        rx="80"
        ry="100"
        fill="url(#hg-halo)"
        className="scene-halo-breathe"
      />

      {/* top cap */}
      <rect
        x="14"
        y="2"
        width="92"
        height="9"
        rx="1.5"
        fill="url(#hg-cap-top)"
      />
      {/* top cap base seam (slight shadow line under cap) */}
      <rect x="16" y="11" width="88" height="1.5" fill="rgba(40,24,0,0.55)" />

      {/* top glass cone (inverted) */}
      <path
        d="M 18 13 L 102 13 L 64 88 L 56 88 Z"
        fill="url(#hg-glass)"
        stroke="rgba(255,184,0,0.5)"
        strokeWidth="0.6"
      />
      {/* top glass — soft inner highlight on right edge */}
      <path
        d="M 95 14 L 100 14 L 64 86 L 62 86 Z"
        fill="rgba(255,255,255,0.08)"
      />

      {/* top sand — about 1/3 remaining (frustum at apex) */}
      <path
        d="M 46 52 L 74 52 L 64 87 L 56 87 Z"
        fill="url(#hg-sand)"
        filter="url(#hg-sand-glow)"
      />
      {/* sand surface highlight line */}
      <line
        x1="46"
        y1="52"
        x2="74"
        y2="52"
        stroke="#fff2c4"
        strokeWidth="0.5"
        opacity="0.9"
      />

      {/* center neck (the narrow channel) */}
      <rect
        x="56"
        y="88"
        width="8"
        height="6"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,184,0,0.55)"
        strokeWidth="0.4"
      />

      {/* falling sand stream — animated dots */}
      <g>
        <circle cx="60" cy="94" r="0.7" fill="#fff2c4" className="sand-dot" style={{ animationDelay: "0s" }} />
        <circle cx="60" cy="98" r="0.6" fill="#ffd17a" className="sand-dot" style={{ animationDelay: "0.18s" }} />
        <circle cx="59.7" cy="102" r="0.8" fill="#fff2c4" className="sand-dot" style={{ animationDelay: "0.36s" }} />
        <circle cx="60.2" cy="106" r="0.6" fill="#ffd17a" className="sand-dot" style={{ animationDelay: "0.54s" }} />
        <circle cx="59.9" cy="110" r="0.75" fill="#fff2c4" className="sand-dot" style={{ animationDelay: "0.72s" }} />
        <circle cx="60.1" cy="114" r="0.6" fill="#ffd17a" className="sand-dot" style={{ animationDelay: "0.9s" }} />
      </g>

      {/* bottom glass cone */}
      <path
        d="M 56 94 L 64 94 L 102 168 L 18 168 Z"
        fill="url(#hg-glass)"
        stroke="rgba(255,184,0,0.5)"
        strokeWidth="0.6"
      />
      {/* bottom glass — left highlight */}
      <path
        d="M 18 168 L 22 168 L 58 96 L 56 96 Z"
        fill="rgba(255,255,255,0.06)"
      />

      {/* bottom sand pile — 2/3 fallen, mound shape */}
      <path
        d="M 22 168 L 98 168 Q 78 132 60 122 Q 42 132 22 168 Z"
        fill="url(#hg-sand)"
        filter="url(#hg-sand-glow)"
      />
      {/* mound highlight */}
      <path
        d="M 30 168 Q 50 144 60 130 Q 70 144 90 168"
        stroke="rgba(255,242,196,0.65)"
        strokeWidth="0.5"
        fill="none"
      />

      {/* bottom cap */}
      <rect x="16" y="167" width="88" height="1.5" fill="rgba(40,24,0,0.55)" />
      <rect
        x="14"
        y="169"
        width="92"
        height="9"
        rx="1.5"
        fill="url(#hg-cap-bot)"
      />
    </svg>
  );
}
