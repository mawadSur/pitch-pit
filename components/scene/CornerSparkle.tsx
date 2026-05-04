// 4-point sparkle — appears in the bottom-right corner across the brand.

export function CornerSparkle({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="scene-sparkle"
    >
      <defs>
        <radialGradient id="sparkle-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff2c4" />
          <stop offset="60%" stopColor="#ffb800" />
          <stop offset="100%" stopColor="#8b6500" />
        </radialGradient>
      </defs>
      <path
        d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
        fill="url(#sparkle-grad)"
        filter="drop-shadow(0 0 4px rgba(255, 184, 0, 0.85))"
      />
    </svg>
  );
}
