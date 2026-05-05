import { ImageResponse } from "next/og";

// Apple touch icon — used by iOS Safari "Add to Home Screen" + macOS Safari
// pinned tabs. 180×180 is the canonical size Apple recommends; iOS will
// downscale for smaller homescreen tiles.
//
// Same gold-p-on-void treatment as app/icon.tsx.

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 42%, #1a1408 0%, #0a0a0a 70%)",
          color: "#FFB800",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: 124,
          lineHeight: 1,
          letterSpacing: -6,
        }}
      >
        p
      </div>
    ),
    size,
  );
}
