// Mobile frame generation when the source MP4s aren't available.
// Downscales the existing desktop 1024w AVIFs to 640w AVIFs and writes
// them to public/scene/frames-{1,2,3}-mobile/. The desktop sequences
// already capture motion at the right cadence (fps=18), so the result
// is visually equivalent to extracting from the MP4 at 640w — same
// frames, smaller files.
//
// Use this when:
//   - transition-1.mp4 / transition-2.mp4 are missing from public/scene
//   - You want to regenerate mobile frames after a desktop reshoot
//     without re-running ffmpeg from the source
//
// For the canonical MP4 → JPEG → AVIF pipeline, see
// scripts/convert-frames-to-avif-mobile.mjs (which the held worktree
// added). Both produce the same output paths.
//
// Idempotent: skips frames whose output AVIF already exists.
// Encoder settings match the desktop pass (quality 60, effort 6) so
// the mobile/desktop crossfade boundary stays seamless.

import { readdir } from "node:fs/promises";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PAIRS = [
  ["public/scene/frames-1", "public/scene/frames-1-mobile"],
  ["public/scene/frames-2", "public/scene/frames-2-mobile"],
  ["public/scene/frames-3", "public/scene/frames-3-mobile"],
];

const TARGET_WIDTH = 640;

let totalConverted = 0;
let totalSkipped = 0;
let totalDesktopBytes = 0;
let totalMobileBytes = 0;

for (const [srcRel, dstRel] of PAIRS) {
  const src = join(ROOT, srcRel);
  const dst = join(ROOT, dstRel);
  if (!existsSync(src)) {
    console.warn(`skipped: source dir ${srcRel} does not exist`);
    continue;
  }
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });

  const files = (await readdir(src))
    .filter((f) => f.endsWith(".avif"))
    .sort();

  let converted = 0;
  let skipped = 0;
  let desktopBytes = 0;
  let mobileBytes = 0;

  for (const f of files) {
    const inPath = join(src, f);
    const outPath = join(dst, f);
    desktopBytes += statSync(inPath).size;
    if (existsSync(outPath)) {
      mobileBytes += statSync(outPath).size;
      skipped++;
      continue;
    }
    await sharp(inPath)
      .resize({ width: TARGET_WIDTH })
      .avif({ quality: 60, effort: 6 })
      .toFile(outPath);
    mobileBytes += statSync(outPath).size;
    converted++;
  }

  const ratio = desktopBytes ? Math.round((mobileBytes / desktopBytes) * 100) : 0;
  console.log(
    `${srcRel} → ${dstRel}: ${files.length} frames (${converted} converted, ${skipped} skipped). ` +
      `Avg desktop ${Math.round(desktopBytes / files.length / 1024)}KB, ` +
      `avg mobile ${Math.round(mobileBytes / files.length / 1024)}KB (${ratio}% of desktop).`,
  );

  totalConverted += converted;
  totalSkipped += skipped;
  totalDesktopBytes += desktopBytes;
  totalMobileBytes += mobileBytes;
}

const totalRatio = totalDesktopBytes
  ? Math.round((totalMobileBytes / totalDesktopBytes) * 100)
  : 0;
console.log(
  `\nDone. ${totalConverted} converted, ${totalSkipped} skipped. ` +
    `Total desktop ${Math.round(totalDesktopBytes / 1024)}KB → mobile ${Math.round(totalMobileBytes / 1024)}KB (${totalRatio}%).`,
);
